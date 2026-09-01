import { supabase } from '../lib/supabase';
import type { Category } from '../types/products';

interface CategoryRow {
  id: string;
  business_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  businessId: row.business_id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const validateName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required.');
  if (trimmed.length > 100) throw new Error('Category name must be 100 characters or fewer.');
  return trimmed;
};

export async function listCategories(businessId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, business_id, name, created_at, updated_at')
    .eq('business_id', businessId)
    .order('name');

  if (error) throw error;
  return (data ?? []).map(toCategory);
}

export async function createCategory(businessId: string, name: string): Promise<Category> {
  const validatedName = validateName(name);
  const { data, error } = await supabase
    .from('categories')
    .insert({ business_id: businessId, name: validatedName })
    .select('id, business_id, name, created_at, updated_at')
    .single();

  if (error) throw error;
  return toCategory(data);
}

export async function updateCategory(categoryId: string, name: string): Promise<Category> {
  const validatedName = validateName(name);
  const { data, error } = await supabase
    .from('categories')
    .update({ name: validatedName })
    .eq('id', categoryId)
    .select('id, business_id, name, created_at, updated_at')
    .single();

  if (error) throw error;
  return toCategory(data);
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId);

  if (error) throw error;
}
