import merge from '../deepmerge';
import { all as mergeAll } from '../deepmerge';

const obj1 = {
  this: 'test',
  that: 1,
  other: {
    thing1: ['tree', 'leaf'],
    thing2: {
      cool: ['sock', 'hat'],
    },
  },
};
const obj2 = {
  this: 'other',
  other: {
    thing1: ['pinecone'],
    thing2: {
      cool: ['vest'],
      hot: 45,
    },
  },
};
const obj3 = {
  other: {
    thing3: 'new',
  },
};

describe('📦 Middleware Redirects', () => {
  test('Merge should work', () => {
    const result = {
      this: 'other',
      that: 1,
      other: {
        thing1: ['tree', 'leaf', 'pinecone'],
        thing2: {
          cool: ['sock', 'hat', 'vest'],
          hot: 45,
        },
      },
    };
    expect(merge(obj1, obj2)).toEqual(result);
  });

  test('MergeAll should work', () => {
    const result = {
      this: 'other',
      that: 1,
      other: {
        thing1: ['tree', 'leaf', 'pinecone'],
        thing2: {
          cool: ['sock', 'hat', 'vest'],
          hot: 45,
        },
        thing3: 'new',
      },
    };
    expect(mergeAll([obj1, obj2, obj3])).toEqual(result);
  });
});
