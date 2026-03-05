import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Список товаров' })
  findAll() {
    return this.productsService.findAll();
  }

  @Post()
  @RequirePermissions('warehouses.manage')
  @ApiOperation({ summary: 'Создать товар' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('warehouses.manage')
  @ApiOperation({ summary: 'Обновить товар' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('warehouses.manage')
  @ApiOperation({ summary: 'Деактивировать товар' })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
