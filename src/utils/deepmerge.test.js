import merge, { all as mergeAll } from '../utils/deepmerge';

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
  arr: [],
  obj: {},
};
const obj3 = {
  other: {
    thing2: { cool: [] },
  },
};

describe('📦  deepmerge', () => {
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
      arr: [],
      obj: {},
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
      },
      arr: [],
      obj: {},
    };
    expect(mergeAll([obj1, obj2, obj3])).toEqual(result);
  });
});
