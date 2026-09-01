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
}
