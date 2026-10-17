export interface PatternDefinition {
  tagSlug: string;
  tagName: string;
  category: string;
  keywords: string[];
  structuralSignals: RegExp[];
  description: string;
}

export const SUPPORTED_PATTERNS: PatternDefinition[] = [
  {
    tagSlug: 'heap-priority-queue',
    tagName: 'Heap (Priority Queue)',
    category: 'Data Structures',
    keywords: [
      'siftUp', 'siftDown', 'percolateUp', 'percolateDown', 'minHeap', 'maxHeap',
      'priorityQueue', 'heapify', 'extractMin', 'extractMax', 'heapPop', 'heapPush'
    ],
    structuralSignals: [
      /((?:index|\w+)\s*-\s*1)\s*(?:>>>|>>|\/)\s*1/, // parent index: (i - 1) / 2
      /(?:2\s*\*\s*(?:index|\w+))\s*\+\s*1/,           // left child index: 2 * i + 1
      /(?:2\s*\*\s*(?:index|\w+))\s*\+\s*2/,           // right child index: 2 * i + 2
      /\bheap\[\s*(?:parent|left|right|\w+)\s*\]/,
    ],
    description: 'Complete binary tree used to quickly extract minimum/maximum elements in O(log n)',
  },
  {
    tagSlug: 'trie',
    tagName: 'Trie',
    category: 'Data Structures',
    keywords: [
      'trie', 'prefixTree', 'radixTree', 'rax', 'insertWord', 'searchPrefix',
      'startsWith', 'matchPrefix', 'longestPrefix', 'autocomplete'
    ],
    structuralSignals: [
      /children\s*\[\s*(?:char|code|index|\w+)\s*\]/,
      /(?:is_terminal|is_end|isTerminal|isEndOfWord|isLeaf)\s*=\s*(?:true|1)/,
      /class\s+TrieNode|\bstruct\s+raxNode|\bstruct\s+trie_node/,
    ],
    description: 'Tree data structure for storing associative keys, optimal for prefix searches and autocomplete',
  },
  {
    tagSlug: 'tree',
    tagName: 'Tree',
    category: 'Data Structures',
    keywords: [
      'treeNode', 'binaryTree', 'left', 'right', 'inorder', 'preorder', 'postorder',
      'redBlackTree', 'rbtree', 'avlTree', 'rotateLeft', 'rotateRight'
    ],
    structuralSignals: [
      /\.(?:left|right)\s*=\s*/,
      /->(?:rb_left|rb_right)/,
      /\bnode->(?:left|right)\b/,
      /function\s+(?:traverse|walk|inorder|preorder|postorder)\w*\s*\(/,
    ],
    description: 'Hierarchical node structure with parent-child links',
  },
  {
    tagSlug: 'graph',
    tagName: 'Graph',
    category: 'Data Structures',
    keywords: [
      'adjacencyList', 'adjList', 'neighbors', 'vertex', 'vertices', 'edges',
      'addVertex', 'addEdge', 'dag', 'directedAcyclicGraph'
    ],
    structuralSignals: [
      /(?:adj|edges|neighbors)\[\s*\w+\s*\]\.push/,
      /\.neighbors\.push\s*\(/,
      /visited\.(?:add|has)\s*\(/,
    ],
    description: 'Network of vertices connected by edges representing relationships and dependencies',
  },
  {
    tagSlug: 'topological-sort',
    tagName: 'Topological Sort',
    category: 'Algorithms',
    keywords: [
      'topologicalSort', 'topoSort', 'inDegree', 'indegree', 'dependencyGraph',
      'resolveDependencies', 'dagSort', 'kahn'
    ],
    structuralSignals: [
      /inDegree\[\s*\w+\s*\]\s*(?:\+\+|--|-=\s*1)/,
      /(?:in_degree|indegree)\s*==\s*0/,
      /while\s*\(\s*(?:queue|zeroDegree)\.length/,
    ],
    description: 'Linear ordering of graph vertices where each directed edge u->v comes before v',
  },
  {
    tagSlug: 'union-find',
    tagName: 'Union Find',
    category: 'Data Structures',
    keywords: [
      'unionFind', 'disjointSet', 'findRoot', 'unionSets', 'pathCompression',
      'rank', 'parentArray', 'connectedComponents'
    ],
    structuralSignals: [
      /parent\[\s*\w+\s*\]\s*=\s*(?:find|parent\[parent)/, // path compression
      /rank\[\s*\w+\s*\]\s*<\s*rank/,                      // union by rank
      /while\s*\(\s*(?:x|root|curr)\s*!==?\s*parent\[/,
    ],
    description: 'Disjoint-set structure keeping track of partitioned elements with near O(1) union/find operations',
  },
  {
    tagSlug: 'lru-cache',
    tagName: 'LRU Cache',
    category: 'Data Structures',
    keywords: [
      'lruCache', 'leastRecentlyUsed', 'moveToHead', 'removeNode', 'addToHead',
      'evict', 'capacity', 'doublyLinkedList'
    ],
    structuralSignals: [
      /this\.(?:head|tail)\.(?:next|prev)/,
      /node\.(?:prev|next)\s*=\s*/,
      /if\s*\(\s*(?:this\.size|size)\s*>\s*(?:this\.capacity|capacity)\s*\)\s*\{[\s\S]*?(?:remove|evict)/,
    ],
    description: 'Cache eviction algorithm that discards the least recently used items first using hash map + DLL',
  },
  {
    tagSlug: 'sliding-window',
    tagName: 'Sliding Window',
    category: 'Algorithms',
    keywords: [
      'slidingWindow', 'windowStart', 'windowEnd', 'leftPointer', 'rightPointer',
      'expandWindow', 'shrinkWindow'
    ],
    structuralSignals: [
      /while\s*\(\s*(?:right|end)\s*<\s*\w+\.length[\s\S]*?(?:left|start)\s*\+\+/,
      /(?:window_size|windowSize)\s*=\s*(?:right|end)\s*-\s*(?:left|start)/,
    ],
    description: 'Algorithm technique where a sub-range moves across an array or stream to compute local properties',
  },
  {
    tagSlug: 'monotonic-stack',
    tagName: 'Monotonic Stack',
    category: 'Data Structures',
    keywords: [
      'monotonicStack', 'monoStack', 'nextGreater', 'previousGreater',
      'nextSmaller', 'largestRectangle'
    ],
    structuralSignals: [
      /while\s*\(\s*stack\.length\s*>0\s*&&\s*\w+\[\s*stack\[\s*stack\.length\s*-\s*1\s*\]\s*\]\s*(?:<=?|>=?)/,
      /stack\.pop\(\)[\s\S]*?stack\.push\(/,
    ],
    description: 'Stack whose elements are monotonically increasing or decreasing, used to find next/previous greater elements in O(n)',
  },
];
