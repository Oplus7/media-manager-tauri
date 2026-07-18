import { describe, it, expect } from 'vitest';

describe('API module structure', () => {
  it('library API exports expected functions', async () => {
    const mod = await import('../api/library');
    expect(typeof mod.queryLibrary).toBe('function');
    expect(typeof mod.getItemDetail).toBe('function');
    expect(typeof mod.updateItem).toBe('function');
    expect(typeof mod.deleteItem).toBe('function');
    expect(typeof mod.exportLibrary).toBe('function');
  });

  it('tags API exports expected functions', async () => {
    const mod = await import('../api/tags');
    expect(typeof mod.getAllTags).toBe('function');
    expect(typeof mod.searchTags).toBe('function');
    expect(typeof mod.checkSimilarTags).toBe('function');
    expect(typeof mod.getItemTags).toBe('function');
    expect(typeof mod.addTagToItem).toBe('function');
    expect(typeof mod.removeTagFromItem).toBe('function');
  });

  it('media API exports expected functions', async () => {
    const mod = await import('../api/media');
    expect(typeof mod.importPaths).toBe('function');
    expect(typeof mod.confirmImport).toBe('function');
    expect(typeof mod.listDirectoryFiles).toBe('function');
    expect(typeof mod.readImageAsBase64).toBe('function');
    expect(typeof mod.extractVideoThumbnail).toBe('function');
  });

  it('series API exports expected functions', async () => {
    const mod = await import('../api/series');
    expect(typeof mod.createSeries).toBe('function');
    expect(typeof mod.getSeriesList).toBe('function');
    expect(typeof mod.getSeriesDetail).toBe('function');
    expect(typeof mod.addItemToSeries).toBe('function');
    expect(typeof mod.removeItemFromSeries).toBe('function');
    expect(typeof mod.deleteSeries).toBe('function');
  });

  it('settings API exports expected functions', async () => {
    const mod = await import('../api/settings');
    expect(typeof mod.getSetting).toBe('function');
    expect(typeof mod.setSetting).toBe('function');
    expect(typeof mod.checkSaveDataWritable).toBe('function');
    expect(typeof mod.getSaveDataDir).toBe('function');
    expect(typeof mod.selectSaveDataDir).toBe('function');
  });
});

describe('Type definitions', () => {
  it('LibraryQuery has correct shape', async () => {
    const query = {
      category: 'all',
      sub_filter: null,
      search: null,
      tag_ids: null,
      tag_mode: 'or' as const,
      page: 1,
      page_size: 50,
      sort_by: 'updated_desc',
    };
    expect(query.category).toBe('all');
    expect(query.tag_mode).toBe('or');
    expect(query.page).toBe(1);
  });

  it('MediaItem type structure is correct', () => {
    const item = {
      id: 'test-id',
      name: 'Test',
      media_type: 'video',
      is_series: false,
      path: '/test/path',
      cover_path: null,
      author: null,
      description: null,
      notes: null,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    };
    expect(item.id).toBe('test-id');
    expect(item.is_series).toBe(false);
    expect(item.cover_path).toBeNull();
  });
});
