import { describe, expect, it } from 'vitest';
import { computeReorderRecommendation } from './reorder.js';

describe('computeReorderRecommendation', () => {
  it('recommends reordering when stock on hand plus incoming is at or below the reorder level', () => {
    expect(computeReorderRecommendation({ stockOnHandQuantity: '5', incomingQuantity: '0', reorderLevel: '10', reorderQuantity: '20' })).toEqual({
      needsReorder: true,
      projectedQuantity: '5.0000',
      suggestedOrderQuantity: '20.0000'
    });
  });

  it('does not recommend reordering when confirmed incoming supply already covers the level', () => {
    expect(computeReorderRecommendation({ stockOnHandQuantity: '5', incomingQuantity: '10', reorderLevel: '10', reorderQuantity: '20' })).toEqual({
      needsReorder: false,
      projectedQuantity: '15.0000',
      suggestedOrderQuantity: '0.0000'
    });
  });

  it('treats being exactly at the reorder level as needing reorder', () => {
    const result = computeReorderRecommendation({ stockOnHandQuantity: '10', incomingQuantity: '0', reorderLevel: '10', reorderQuantity: '5' });
    expect(result.needsReorder).toBe(true);
  });

  it('does not recommend reordering above the level', () => {
    const result = computeReorderRecommendation({ stockOnHandQuantity: '11', incomingQuantity: '0', reorderLevel: '10', reorderQuantity: '5' });
    expect(result.needsReorder).toBe(false);
  });
});
