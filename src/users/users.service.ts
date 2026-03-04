import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateUserDto,
  UpdateUserProfileDto,
  AddContactDto,
  AddLanguageDto,
  AddCitizenshipDto,
  UpdateCredentialsDto,
  ExportUsersDto,
} from './dto/users.dto';
import * as ExcelJS from 'exceljs';
import dayjs from 'dayjs';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // === Создание (регистрация) юзера ===
  async create(dto: CreateUserDto, adminId: string, ip?: string) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('errors.emailTaken');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        roleId: dto.roleId,
      },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'user.created',
      entity: 'user',
      entityId: user.id,
      details: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      ip,
    });

    return this.findById(user.id);
  }

  // === Список юзеров с фильтрами ===
  async findAll(params: {
    filter?: 'all' | 'active' | 'blocked' | 'online' | 'offline';
    search?: string;
    page?: number;
    limit?: number;
    detailed?: boolean;
  }) {
    const {
      filter = 'all',
      search,
      page = 1,
      limit = 20,
      detailed = false,
    } = params;

    const where: any = {};
    // Порог активности — 2 минуты
    const onlineThreshold = new Date(Date.now() - 2 * 60 * 1000);

    switch (filter) {
      case 'active':
        where.isActive = true;
        break;
      case 'blocked':
        where.isActive = false;
        break;
      case 'online':
        where.isActive = true;
        where.lastSeen = { gte: onlineThreshold };
        break;
      case 'offline':
        where.isActive = true;
        where.OR = [{ lastSeen: null }, { lastSeen: { lt: onlineThreshold } }];
        break;
    }

    if (search) {
      const searchCondition = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
      if (where.OR) {
        const offlineCondition = where.OR;
        delete where.OR;
        where.AND = [{ OR: offlineCondition }, { OR: searchCondition }];
      } else {
        where.OR = searchCondition;
      }
    }

    const baseSelect = {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isActive: true,
      isOnline: true,
      lastSeen: true,
      createdAt: true,
    };

    const detailedSelect = {
      ...baseSelect,
      tradeCode: true,
      birthDate: true,
      firstTripDate: true,
      isCoordinator: true,
      coordinatorId: true,
      isMarried: true,
      hasChildren: true,
      hasPassport: true,
      hasDriverLicense: true,
      drivingExperience: true,
      comment: true,
      passportNumber: true,
      registrationAddress: true,
      livingAddress: true,
      role: { select: { name: true } },
      coordinator: { select: { id: true, firstName: true, lastName: true } },
      languages: { select: { language: true, level: true } },
      contacts: { select: { type: true, countryCode: true, phone: true } },
      citizenships: { select: { country: true } },
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: detailed ? detailedSelect : baseSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Вычисляем актуальный isOnline на основе lastSeen
    const enrichedData = data.map((u: any) => ({
      ...u,
      isOnline: u.lastSeen ? u.lastSeen >= onlineThreshold : false,
    }));

    return {
      data: enrichedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // === Получить юзера по ID (полный профиль) ===
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
        contacts: true,
        languages: true,
        citizenships: true,
        documents: {
          select: {
            id: true,
            title: true,
            description: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        coordinator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        subordinates: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!user) throw new NotFoundException('errors.userNotFound');

    // Вычисляем актуальный isOnline на основе lastSeen (порог — 2 мин)
    const onlineThreshold = new Date(Date.now() - 2 * 60 * 1000);
    const isOnline = user.lastSeen ? user.lastSeen >= onlineThreshold : false;

    const { password, ...result } = user;
    return { ...result, isOnline };
  }

  // === Обновить профиль ===
  async updateProfile(
    id: string,
    dto: UpdateUserProfileDto,
    adminId: string,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('errors.userNotFound');

    if (dto.tradeCode) {
      const codeExists = await this.prisma.user.findUnique({
        where: { tradeCode: dto.tradeCode },
      });
      if (codeExists && codeExists.id !== id) {
        throw new ConflictException('errors.tradeCodeTaken');
      }
    }

    const updateData: any = { ...dto };

    if (dto.isCoordinator === true) {
      updateData.coordinatorId = null;
    }

    if (dto.firstTripDate)
      updateData.firstTripDate = new Date(dto.firstTripDate);
    if (dto.birthDate) updateData.birthDate = new Date(dto.birthDate);

    await this.prisma.user.update({ where: { id }, data: updateData });

    await this.auditService.log({
      userId: adminId,
      action: 'user.profile_updated',
      entity: 'user',
      entityId: id,
      details: dto,
      ip,
    });

    return this.findById(id);
  }

  // === Контакты ===
  async addContact(userId: string, dto: AddContactDto, adminId: string) {
    const count = await this.prisma.userContact.count({ where: { userId } });
    if (count >= 5) throw new BadRequestException('errors.maxContacts');

    this.validatePhone(dto.countryCode, dto.phone);

    const contact = await this.prisma.userContact.create({
      data: { userId, ...dto },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'user.contact_added',
      entity: 'user',
      entityId: userId,
      details: dto,
    });

    return contact;
  }

  async removeContact(contactId: string, adminId: string) {
    await this.prisma.userContact.delete({ where: { id: contactId } });

    await this.auditService.log({
      userId: adminId,
      action: 'user.contact_removed',
      entity: 'user_contact',
      entityId: contactId,
    });
  }

  private validatePhone(countryCode: string, phone: string) {
    const rules: Record<string, number[]> = {
      '+998': [9],
      '+7': [10],
      '+996': [9],
      '+992': [9],
      '+993': [8],
      '+375': [9, 10],
      '+380': [9],
      '+994': [9],
      '+995': [9],
      '+374': [8],
    };

    const allowedLengths = rules[countryCode];
    if (allowedLengths && !allowedLengths.includes(phone.length)) {
      throw new BadRequestException('errors.phoneInvalidFormat');
    }
  }

  // === Языки ===
  async addLanguage(userId: string, dto: AddLanguageDto, adminId: string) {
    const exists = await this.prisma.userLanguage.findUnique({
      where: { userId_language: { userId, language: dto.language } },
    });
    if (exists) throw new ConflictException('errors.languageAlreadyAdded');

    const lang = await this.prisma.userLanguage.create({
      data: { userId, ...dto },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'user.language_added',
      entity: 'user',
      entityId: userId,
      details: dto,
    });

    return lang;
  }

  async removeLanguage(languageId: string, adminId: string) {
    await this.prisma.userLanguage.delete({ where: { id: languageId } });

    await this.auditService.log({
      userId: adminId,
      action: 'user.language_removed',
      entity: 'user_language',
      entityId: languageId,
    });
  }

  // === Гражданства ===
  async setCitizenships(
    userId: string,
    dto: AddCitizenshipDto,
    adminId: string,
  ) {
    await this.prisma.userCitizenship.deleteMany({ where: { userId } });
    await this.prisma.userCitizenship.createMany({
      data: dto.countries.map((country) => ({ userId, country })),
    });

    await this.auditService.log({
      userId: adminId,
      action: 'user.citizenships_updated',
      entity: 'user',
      entityId: userId,
      details: dto,
    });

    return this.prisma.userCitizenship.findMany({ where: { userId } });
  }

  // === Смена email / пароля / роли ===
  async updateCredentials(
    id: string,
    dto: UpdateCredentialsDto,
    adminId: string,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('errors.userNotFound');

    const updateData: any = {};

    if (dto.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailExists && emailExists.id !== id)
        throw new ConflictException('errors.emailTaken');
      updateData.email = dto.email;
    }

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.roleId !== undefined) {
      updateData.roleId = dto.roleId || null;
    }

    await this.prisma.user.update({ where: { id }, data: updateData });

    await this.auditService.log({
      userId: adminId,
      action: 'user.credentials_updated',
      entity: 'user',
      entityId: id,
      details: {
        emailChanged: !!dto.email,
        passwordChanged: !!dto.password,
        roleChanged: dto.roleId !== undefined,
      },
      ip,
    });

    return this.findById(id);
  }

  // === Обновить лимит сессий (для любого юзера с правом session.manage) ===
  async updateMaxSessions(
    targetUserId: string,
    maxSessions: number,
    adminId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new NotFoundException('errors.userNotFound');

    const activeSessions = await this.prisma.session.count({
      where: { userId: targetUserId, expiresAt: { gt: new Date() } },
    });
    if (activeSessions > maxSessions) {
      throw new BadRequestException('errors.sessionLimitTooLow');
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { maxSessions },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'session.max_updated',
      entity: 'user',
      entityId: targetUserId,
      details: { maxSessions },
    });

    return { maxSessions };
  }

  // === Список координаторов (для выпадающего списка) ===
  async getCoordinators() {
    return this.prisma.user.findMany({
      where: { isCoordinator: true, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { lastName: 'asc' },
    });
  }

  // === Экспорт пользователей ===
  async exportUsers(dto: ExportUsersDto): Promise<Buffer> {
    const {
      fields,
      format = 'xlsx',
      scope = 'all',
      filter = 'all',
      search,
      page = 1,
      limit = 20,
    } = dto;
    const fieldSet = new Set(fields);

    // Строим where (reuse логики из findAll)
    const where: any = {};
    const onlineThreshold = new Date(Date.now() - 2 * 60 * 1000);

    switch (filter) {
      case 'active':
        where.isActive = true;
        break;
      case 'blocked':
        where.isActive = false;
        break;
      case 'online':
        where.isActive = true;
        where.lastSeen = { gte: onlineThreshold };
        break;
      case 'offline':
        where.isActive = true;
        where.OR = [{ lastSeen: null }, { lastSeen: { lt: onlineThreshold } }];
        break;
    }

    if (search) {
      const searchCondition = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
      if (where.OR) {
        const offlineCondition = where.OR;
        delete where.OR;
        where.AND = [{ OR: offlineCondition }, { OR: searchCondition }];
      } else {
        where.OR = searchCondition;
      }
    }

    // Нужные include
    const needsRole = fieldSet.has('role');
    const needsContacts = fieldSet.has('contacts');
    const needsLanguages = fieldSet.has('languages');
    const needsCitizenships = fieldSet.has('citizenships');
    const needsCoordinator = fieldSet.has('coordinator');

    const users = await this.prisma.user.findMany({
      where,
      include: {
        ...(needsRole && { role: { select: { name: true } } }),
        ...(needsContacts && { contacts: true }),
        ...(needsLanguages && { languages: true }),
        ...(needsCitizenships && { citizenships: true }),
        ...(needsCoordinator && {
          coordinator: { select: { firstName: true, lastName: true } },
        }),
      },
      orderBy: { createdAt: 'desc' },
      ...(scope === 'page' && { skip: (page - 1) * limit, take: limit }),
    });

    // Маппинг полей → заголовок + значение
    const FIELD_MAP: Record<
      string,
      { header: string; getValue: (u: any) => string }
    > = {
      email: { header: 'Email', getValue: (u) => u.email || '' },
      lastName: { header: 'Фамилия', getValue: (u) => u.lastName || '' },
      firstName: { header: 'Имя', getValue: (u) => u.firstName || '' },
      middleName: { header: 'Отчество', getValue: (u) => u.middleName || '' },
      role: { header: 'Роль', getValue: (u) => u.role?.name || '' },
      tradeCode: {
        header: 'Код торгового',
        getValue: (u) => u.tradeCode || '',
      },
      birthDate: {
        header: 'Дата рождения',
        getValue: (u) =>
          u.birthDate ? dayjs(u.birthDate).format('DD.MM.YYYY') : '',
      },
      isMarried: {
        header: 'В браке',
        getValue: (u) =>
          u.isMarried === true ? 'Да' : u.isMarried === false ? 'Нет' : '',
      },
      hasChildren: {
        header: 'Есть дети',
        getValue: (u) =>
          u.hasChildren === true ? 'Да' : u.hasChildren === false ? 'Нет' : '',
      },
      hasPassport: {
        header: 'Загранпаспорт',
        getValue: (u) =>
          u.hasPassport === true ? 'Да' : u.hasPassport === false ? 'Нет' : '',
      },
      hasDriverLicense: {
        header: 'Водительские права',
        getValue: (u) =>
          u.hasDriverLicense === true
            ? 'Да'
            : u.hasDriverLicense === false
              ? 'Нет'
              : '',
      },
      drivingExperience: {
        header: 'Стаж вождения',
        getValue: (u) =>
          u.drivingExperience != null ? String(u.drivingExperience) : '',
      },
      passportNumber: {
        header: 'Номер паспорта',
        getValue: (u) => u.passportNumber || '',
      },
      registrationAddress: {
        header: 'Адрес прописки',
        getValue: (u) => u.registrationAddress || '',
      },
      livingAddress: {
        header: 'Адрес проживания',
        getValue: (u) => u.livingAddress || '',
      },
      comment: { header: 'Комментарий', getValue: (u) => u.comment || '' },
      isCoordinator: {
        header: 'Координатор',
        getValue: (u) => (u.isCoordinator ? 'Да' : 'Нет'),
      },
      coordinator: {
        header: 'Координатор (имя)',
        getValue: (u) =>
          u.coordinator
            ? `${u.coordinator.lastName} ${u.coordinator.firstName}`
            : '',
      },
      firstTripDate: {
        header: 'Дата первого выезда',
        getValue: (u) =>
          u.firstTripDate ? dayjs(u.firstTripDate).format('DD.MM.YYYY') : '',
      },
      languages: {
        header: 'Языки',
        getValue: (u) =>
          (u.languages || [])
            .map((l: any) => `${l.language} — ${l.level}`)
            .join(format === 'csv' ? '; ' : '\n'),
      },
      contacts: {
        header: 'Контакты',
        getValue: (u) =>
          (u.contacts || [])
            .map((c: any) => `${c.type}: ${c.countryCode}${c.phone}`)
            .join(format === 'csv' ? '; ' : '\n'),
      },
      citizenships: {
        header: 'Гражданства',
        getValue: (u) =>
          (u.citizenships || [])
            .map((c: any) => c.country)
            .join(format === 'csv' ? '; ' : '\n'),
      },
      isActive: {
        header: 'Статус',
        getValue: (u) => (u.isActive ? 'Активен' : 'Заблокирован'),
      },
      isOnline: {
        header: 'Онлайн',
        getValue: (u) =>
          u.lastSeen && u.lastSeen >= onlineThreshold ? 'Да' : 'Нет',
      },
      createdAt: {
        header: 'Дата создания',
        getValue: (u) =>
          u.createdAt ? dayjs(u.createdAt).format('DD.MM.YYYY') : '',
      },
    };

    // Только выбранные поля
    const activeFields = fields.filter((f) => FIELD_MAP[f]);

    if (format === 'csv') {
      return this.generateCsv(users, activeFields, FIELD_MAP);
    }
    return this.generateXlsx(users, activeFields, FIELD_MAP);
  }

  private async generateXlsx(
    users: any[],
    fields: string[],
    fieldMap: Record<string, { header: string; getValue: (u: any) => string }>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Пользователи');

    sheet.columns = fields.map((f) => ({
      header: fieldMap[f].header,
      key: f,
      width: 25,
    }));

    // Жирный заголовок
    sheet.getRow(1).font = { bold: true };

    for (const user of users) {
      const row: Record<string, any> = {};
      for (const f of fields) {
        row[f] = fieldMap[f].getValue(user);
      }
      sheet.addRow(row);
    }

    // wrapText для массивных полей
    for (const key of ['languages', 'contacts', 'citizenships']) {
      if (fields.includes(key)) {
        sheet.getColumn(key).eachCell((cell) => {
          cell.alignment = { wrapText: true, vertical: 'top' };
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private generateCsv(
    users: any[],
    fields: string[],
    fieldMap: Record<string, { header: string; getValue: (u: any) => string }>,
  ): Buffer {
    const BOM = '\uFEFF';
    const SEP = ';';

    const header = fields.map((f) => `"${fieldMap[f].header}"`).join(SEP);
    const rows = users.map((user) =>
      fields
        .map((f) => {
          const val = fieldMap[f].getValue(user).replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(SEP),
    );

    const csv = BOM + [header, ...rows].join('\r\n');
    return Buffer.from(csv, 'utf-8');
  }
}
