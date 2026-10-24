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
      'siftUp', 'sift_up', 'siftDown', 'sift_down', 'percolateUp', 'percolateDown',
      'minHeap', 'min_heap', 'maxHeap', 'max_heap', 'priorityQueue', 'priority_queue',
      'heapify', 'extractMin', 'extractMax', 'heapPop', 'heappop', 'heapPush', 'heappush',
    ],
    structuralSignals: [
      /((?:index|i|\w+)\s*-\s*1)\s*(?:>>>|>>|\/)\s*1/,
      /(?:2\s*\*\s*(?:index|i|\w+))\s*\+\s*1/,
      /(?:2\s*\*\s*(?:index|i|\w+))\s*\+\s*2/,
      /(?:index|i|\w+)\s*\*\s*2\s*\+\s*1/,
      /\bheap\[\s*(?:parent|left|right|index|i|\w+)\s*\]/,
    ],
    description: 'Complete binary tree used to quickly extract minimum/maximum elements in O(log n)',
  },
  {
    tagSlug: 'monotonic-stack',
    tagName: 'Monotonic Stack',
    category: 'Data Structures',
    keywords: [
      'monotonicStack', 'monotonic_stack', 'monoStack', 'mono_stack',
      'nextGreater', 'next_greater', 'previousGreater', 'previous_greater',
      'nextSmaller', 'next_smaller', 'largestRectangle', 'stack',
    ],
    structuralSignals: [
      /while\s+(?:\(?\s*stack|\(?\s*len\s*\(\s*stack|\(?\s*\w+\.length)[\s\S]*?(?:<=?|>=?|<|>)/,
      /(?:stack|\w+)\.pop\s*\(\s*\)[\s\S]*?(?:stack|\w+)\.(?:push|append)\s*\(/,
      /stack\[\s*stack\.length\s*-\s*1\s*\]/,
      /stack\[\s*-1\s*\]/,
    ],
    description: 'Stack whose elements are monotonically increasing or decreasing, used to find next/previous greater elements in O(n)',
  },
  {
    tagSlug: 'binary-search',
    tagName: 'Binary Search',
    category: 'Algorithms',
    keywords: [
      'binarySearch', 'binary_search', 'bisect', 'bsearch', 'lower_bound', 'upper_bound',
      'searchRange', 'findMedianSortedArrays',
    ],
    structuralSignals: [
      /while\s*\(?\s*(?:low|left|start)\s*<=?\s*(?:high|right|end)/,
      /(?:low|left|start)\s*\+\s*(?:\(?\s*(?:high|right|end)\s*-\s*(?:low|left|start)\s*\)?)\s*(?:>>|\/)\s*(?:1|2)/,
      /(?:mid|middle)\s*=\s*(?:\(?\s*(?:low|left)\s*\+\s*(?:high|right)\s*\)?)\s*(?:>>|\/)\s*(?:1|2)/,
    ],
    description: 'Search algorithm that finds the position of a target value within a sorted array in O(log n)',
  },
  {
    tagSlug: 'two-pointers',
    tagName: 'Two Pointers',
    category: 'Algorithms',
    keywords: [
      'twoPointers', 'two_pointers', 'leftPointer', 'rightPointer', 'twinPointers',
      'pairSum', 'threeSum', 'containerWithMostWater',
    ],
    structuralSignals: [
      /while\s*\(?\s*(?:left|start|low)\s*<\s*(?:right|end|high)\s*\)?/,
      /(?:left|start)\s*(?:\+\+|\+=\s*1)[\s\S]*?(?:right|end)\s*(?:--|-=\s*1)/,
    ],
    description: 'Technique using two indices moving across a sequence to find pairs or subarrays in linear time',
  },
  {
    tagSlug: 'trie',
    tagName: 'Trie',
    category: 'Data Structures',
    keywords: [
      'trie', 'prefixTree', 'prefix_tree', 'radixTree', 'rax', 'insertWord',
      'searchPrefix', 'startsWith', 'matchPrefix', 'longestPrefix', 'autocomplete',
    ],
    structuralSignals: [
      /children\s*\[\s*(?:char|code|index|\w+)\s*\]/,
      /(?:is_terminal|is_end|isTerminal|isEndOfWord|isLeaf)\s*=\s*(?:true|1|True)/,
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
      'redBlackTree', 'rbtree', 'avlTree', 'rotateLeft', 'rotateRight',
    ],
    structuralSignals: [
      /\.(?:left|right)\s*=\s*/,
      /->(?:rb_left|rb_right)/,
      /\bnode->(?:left|right)\b/,
      /(?:function|def)\s+(?:traverse|walk|inorder|preorder|postorder)\w*\s*\(/,
    ],
    description: 'Hierarchical node structure with parent-child links',
  },
  {
    tagSlug: 'graph',
    tagName: 'Graph',
    category: 'Data Structures',
    keywords: [
      'adjacencyList', 'adjList', 'neighbors', 'vertex', 'vertices', 'edges',
      'addVertex', 'addEdge', 'dag', 'directedAcyclicGraph',
    ],
    structuralSignals: [
      /(?:adj|edges|neighbors)\[\s*\w+\s*\]\.(?:push|append)/,
      /\.neighbors\.(?:push|append)\s*\(/,
      /visited\.(?:add|has)\s*\(/,
    ],
    description: 'Network of vertices connected by edges representing relationships and dependencies',
  },
  {
    tagSlug: 'topological-sort',
    tagName: 'Topological Sort',
    category: 'Algorithms',
    keywords: [
      'topologicalSort', 'topological_sort', 'topoSort', 'inDegree', 'indegree',
      'dependencyGraph', 'resolveDependencies', 'dagSort', 'kahn',
    ],
    structuralSignals: [
      /inDegree\[\s*\w+\s*\]\s*(?:\+\+|--|-=\s*1|\+=\s*1)/,
      /(?:in_degree|indegree)\s*==\s*0/,
      /while\s*\(?\s*(?:queue|zeroDegree|zero_in_degree)\.(?:length|size|pop)/,
    ],
    description: 'Linear ordering of graph vertices where each directed edge u->v comes before v',
  },
  {
    tagSlug: 'union-find',
    tagName: 'Union Find',
    category: 'Data Structures',
    keywords: [
      'unionFind', 'union_find', 'disjointSet', 'disjoint_set', 'findRoot',
      'unionSets', 'pathCompression', 'rank', 'parentArray', 'connectedComponents',
    ],
    structuralSignals: [
      /parent\[\s*\w+\s*\]\s*=\s*(?:find|parent\[parent)/,
      /rank\[\s*\w+\s*\]\s*<\s*rank/,
      /while\s*\(?\s*(?:x|root|curr)\s*!==?\s*parent\[/,
    ],
    description: 'Disjoint-set structure keeping track of partitioned elements with near O(1) union/find operations',
  },
  {
    tagSlug: 'lru-cache',
    tagName: 'LRU Cache',
    category: 'Data Structures',
    keywords: [
      'lruCache', 'lru_cache', 'leastRecentlyUsed', 'moveToHead', 'removeNode',
      'addToHead', 'evict', 'capacity', 'doublyLinkedList',
    ],
    structuralSignals: [
      /this\.(?:head|tail)\.(?:next|prev)/,
      /node\.(?:prev|next)\s*=\s*/,
      /if\s*\(?\s*(?:this\.size|size|len\(self\.\w+\))\s*>\s*(?:this\.capacity|capacity|self\.capacity)/,
    ],
    description: 'Cache eviction algorithm that discards the least recently used items first using hash map + DLL',
  },
  {
    tagSlug: 'sliding-window',
    tagName: 'Sliding Window',
    category: 'Algorithms',
    keywords: [
      'slidingWindow', 'sliding_window', 'windowStart', 'windowEnd', 'leftPointer',
      'rightPointer', 'expandWindow', 'shrinkWindow',
    ],
    structuralSignals: [
      /while\s*\(?\s*(?:right|end)\s*<\s*(?:\w+\.length|len\(\w+\))[\s\S]*?(?:left|start)\s*(?:\+\+|\+=\s*1)/,
      /(?:window_size|windowSize)\s*=\s*(?:right|end)\s*-\s*(?:left|start)/,
    ],
    description: 'Algorithm technique where a sub-range moves across an array or stream to compute local properties',
  },
];
