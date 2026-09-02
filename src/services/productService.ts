import { supabase } from '../lib/supabase'
import type { CreateProductInput, Product, ProductUnitType, UpdateProductInput } from '../types/products'
import { isFractionalUnit } from '../types/products'

type ProductRow = {
  id: string
  business_id: string
  category_id: string
  name: string
  sku: string
  barcode: string | null
  cost_price: number | string
  selling_price: number | string
  stock_quantity: number | string
  minimum_stock: number | string
  unit_type: ProductUnitType
  is_active: boolean
  created_at: string
  updated_at: string
}

const mapProduct = (row: ProductRow): Product => ({
  id: row.id,
  businessId: row.business_id,
  categoryId: row.category_id,
  name: row.name,
  sku: row.sku,
  barcode: row.barcode,
  costPrice: Number(row.cost_price),
  sellingPrice: Number(row.selling_price),
  stockQuantity: Number(row.stock_quantity),
  minimumStock: Number(row.minimum_stock),
  unitType: row.unit_type,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const requiredText = (value: string, label: string, max = 100) => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  if (trimmed.length > max) throw new Error(`${label} must be ${max} characters or fewer.`)
  return trimmed
}

const validateQuantity = (value: number, unit: ProductUnitType, label: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a valid non-negative number.`)
  if (!isFractionalUnit(unit) && !Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number for ${unit === 'pack' ? 'pack' : 'piece'} products.`)
  }
}

const validateNumbers = (cost: number, selling: number, stock: number, minimum: number, unit: ProductUnitType) => {
  if (![cost, selling].every(Number.isFinite) || [cost, selling].some((value) => value < 0)) {
    throw new Error('Product prices must be valid non-negative numbers.')
  }
  validateQuantity(stock, unit, 'Stock quantity')
  validateQuantity(minimum, unit, 'Minimum stock')
  if (selling < cost) throw new Error('Selling price cannot be lower than cost price.')
}

export const listProducts = async (businessId: string): Promise<Product[]> => {
  if (!businessId) throw new Error('Business is required.')
  const { data, error } = await supabase.from('products').select('*').eq('business_id', businessId).order('name')
  if (error) throw error
  return (data ?? []).map(mapProduct)
}

export const createProduct = async (input: CreateProductInput): Promise<Product> => {
  const name = requiredText(input.name, 'Product name')
  const sku = requiredText(input.sku, 'SKU')
  const categoryId = requiredText(input.categoryId, 'Category')
  validateNumbers(input.costPrice, input.sellingPrice, input.stockQuantity, input.minimumStock, input.unitType)
  const { data, error } = await supabase.from('products').insert({
    business_id: input.businessId,
    category_id: categoryId,
    name,
    sku,
    barcode: input.barcode?.trim() || null,
    cost_price: input.costPrice,
    selling_price: input.sellingPrice,
    stock_quantity: input.stockQuantity,
    minimum_stock: input.minimumStock,
    unit_type: input.unitType,
    is_active: true,
  }).select('*').single()
  if (error) throw error
  return mapProduct(data)
}

export const updateProduct = async (id: string, input: UpdateProductInput): Promise<Product> => {
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = requiredText(input.name, 'Product name')
  if (input.sku !== undefined) updates.sku = requiredText(input.sku, 'SKU')
  if (input.categoryId !== undefined) updates.category_id = requiredText(input.categoryId, 'Category')
  if (input.barcode !== undefined) updates.barcode = input.barcode?.trim() || null
  if (input.costPrice !== undefined) updates.cost_price = input.costPrice
  if (input.sellingPrice !== undefined) updates.selling_price = input.sellingPrice
  if (input.stockQuantity !== undefined) updates.stock_quantity = input.stockQuantity
  if (input.minimumStock !== undefined) updates.minimum_stock = input.minimumStock
  if (input.unitType !== undefined) updates.unit_type = input.unitType
  if (Object.keys(updates).length === 0) throw new Error('No product changes provided.')

  const { data: current, error: currentError } = await supabase.from('products').select('cost_price, selling_price, stock_quantity, minimum_stock, unit_type').eq('id', id).single()
  if (currentError) throw currentError
  const unit = input.unitType ?? current.unit_type as ProductUnitType
  validateNumbers(input.costPrice ?? Number(current.cost_price), input.sellingPrice ?? Number(current.selling_price), input.stockQuantity ?? Number(current.stock_quantity), input.minimumStock ?? Number(current.minimum_stock), unit)

  const { data, error } = await supabase.from('products').update(updates).eq('id', id).select('*').single()
  if (error) throw error
  return mapProduct(data)
}

export const deactivateProduct = async (id: string): Promise<Product> => {
  const { data, error } = await supabase.from('products').update({ is_active: false }).eq('id', id).select('*').single()
  if (error) throw error
  return mapProduct(data)
}

export const activateProduct = async (id: string): Promise<Product> => {
  const { data, error } = await supabase.from('products').update({ is_active: true }).eq('id', id).select('*').single()
  if (error) throw error
  return mapProduct(data)
}
