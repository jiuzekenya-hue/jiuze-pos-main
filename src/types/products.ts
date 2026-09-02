export type ProductUnitType = 'piece' | 'pack' | 'kg' | 'g' | 'litre' | 'ml'

export const PRODUCT_UNITS: { value: ProductUnitType; label: string }[] = [
  { value: 'piece', label: 'Piece' },
  { value: 'pack', label: 'Pack' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'litre', label: 'Litre (L)' },
  { value: 'ml', label: 'Millilitre (ml)' },
]

export const isFractionalUnit = (unit: ProductUnitType) => unit === 'kg' || unit === 'g' || unit === 'litre' || unit === 'ml'

export const unitLabel = (unit: ProductUnitType) => PRODUCT_UNITS.find((item) => item.value === unit)?.label ?? unit

export interface Category {
  id: string;
  businessId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  sku: string;
  barcode: string | null;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minimumStock: number;
  unitType: ProductUnitType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  businessId: string;
  categoryId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minimumStock: number;
  unitType: ProductUnitType;
}

export interface UpdateProductInput {
  categoryId?: string;
  name?: string;
  sku?: string;
  barcode?: string | null;
  costPrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  minimumStock?: number;
  unitType?: ProductUnitType;
}
