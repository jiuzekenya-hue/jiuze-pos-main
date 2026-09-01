import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCategory, deleteCategory, listCategories, updateCategory } from '../services/categoryService'

const mockSingle = vi.fn()
const mockOrder = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    })),
  },
}))

describe('categoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
    mockEq.mockReturnValue({ order: mockOrder, select: mockSelect, single: mockSingle })
    mockOrder.mockResolvedValue({ data: [], error: null })
    mockInsert.mockReturnValue({ select: mockSelect })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockDelete.mockReturnValue({ eq: mockEq })
    mockSingle.mockResolvedValue({
      data: {
        id: 'cat-1', business_id: 'business-1', name: 'Beverages',
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
      },
      error: null,
    })
  })

  it('lists categories for a business and maps database fields', async () => {
    mockOrder.mockResolvedValue({
      data: [{
        id: 'cat-1', business_id: 'business-1', name: 'Beverages',
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
      }], error: null,
    })
    await expect(listCategories('business-1')).resolves.toEqual([{
      id: 'cat-1', businessId: 'business-1', name: 'Beverages',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    }])
    expect(mockEq).toHaveBeenCalledWith('business_id', 'business-1')
    expect(mockOrder).toHaveBeenCalledWith('name')
  })

  it('trims and creates a category', async () => {
    await expect(createCategory('business-1', '  Beverages  ')).resolves.toMatchObject({ id: 'cat-1', name: 'Beverages' })
    expect(mockInsert).toHaveBeenCalledWith({ business_id: 'business-1', name: 'Beverages' })
  })

  it('rejects an empty category name', async () => {
    await expect(createCategory('business-1', '   ')).rejects.toThrow('Category name is required.')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects category names longer than 100 characters', async () => {
    await expect(createCategory('business-1', 'a'.repeat(101))).rejects.toThrow('Category name must be 100 characters or fewer.')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('updates a category with a trimmed name', async () => {
    await expect(updateCategory('cat-1', '  Grocery  ')).resolves.toMatchObject({ id: 'cat-1', name: 'Beverages' })
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Grocery' })
    expect(mockEq).toHaveBeenCalledWith('id', 'cat-1')
  })

  it('deletes a category by id', async () => {
    mockEq.mockResolvedValue({ error: null })
    await expect(deleteCategory('cat-1')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('id', 'cat-1')
  })

  it('propagates Supabase errors', async () => {
    const error = { message: 'database failure' }
    mockOrder.mockResolvedValue({ data: null, error })
    await expect(listCategories('business-1')).rejects.toEqual(error)
  })
})
