export interface SeedExample {
  repoFullName: string;
  repoName: string;
  repoUrl: string;
  stars: number;
  filePath: string;
  functionName: string;
  language: string;
  startLine: number;
  endLine: number;
  sourceUrl: string;
  rationale: string;
  productionContext: string;
  confidenceScore: number;
  tags: string[];
  codeSnippet: string;
}

export const SEED_EXAMPLES: SeedExample[] = [
  {
    repoFullName: 'facebook/react',
    repoName: 'react',
    repoUrl: 'https://github.com/facebook/react',
    stars: 228000,
    filePath: 'packages/scheduler/src/forks/SchedulerMinHeap.js',
    functionName: 'siftDown',
    language: 'JavaScript',
    startLine: 43,
    endLine: 82,
    sourceUrl: 'https://github.com/facebook/react/blob/main/packages/scheduler/src/forks/SchedulerMinHeap.js#L43-L82',
    rationale: 'React Scheduler uses a binary min-heap to keep track of concurrent tasks ordered by expiration time. Sift-down restores the heap invariant in O(log n) when the earliest deadline task is popped during browser idle frames.',
    productionContext: 'React Concurrent Mode Scheduler',
    confidenceScore: 0.99,
    tags: ['heap-priority-queue'],
    codeSnippet: `function siftDown(heap, node, i) {
  let index = i;
  const length = heap.length;
  const halfLength = length >>> 1;
  while (index < halfLength) {
    const leftIndex = (index + 1) * 2 - 1;
    const left = heap[leftIndex];
    const rightIndex = leftIndex + 1;
    const right = heap[rightIndex];

    // If the left or right node is smaller, swap with the smaller of those.
    if (compare(left, node) < 0) {
      if (rightIndex < length && compare(right, left) < 0) {
        heap[index] = right;
        heap[rightIndex] = node;
        index = rightIndex;
      } else {
        heap[index] = left;
        heap[leftIndex] = node;
        index = leftIndex;
      }
    } else if (rightIndex < length && compare(right, node) < 0) {
      heap[index] = right;
      heap[rightIndex] = node;
      index = rightIndex;
    } else {
      // Neither child is smaller. Exit.
      return;
    }
  }
}`,
  },
  {
    repoFullName: 'microsoft/vscode',
    repoName: 'vscode',
    repoUrl: 'https://github.com/microsoft/vscode',
    stars: 163000,
    filePath: 'src/vs/base/common/trie.ts',
    functionName: 'findSubstr',
    language: 'TypeScript',
    startLine: 88,
    endLine: 125,
    sourceUrl: 'https://github.com/microsoft/vscode/blob/main/src/vs/base/common/trie.ts#L88-L125',
    rationale: 'VS Code implements a Prefix Trie for fast workspace URI lookup and IntelliSense symbol matching. Traversing trie edges by path segments allows O(k) longest-prefix route matching rather than scanning thousands of open files.',
    productionContext: 'Monaco Editor Workspace URI Router & Autocomplete',
    confidenceScore: 0.98,
    tags: ['trie', 'tree', 'design'],
    codeSnippet: `public findSubstr(key: string): E | undefined {
  let iter = this._keyIterator.reset(key);
  let node = this._root;
  let element: E | undefined = undefined;

  while (node) {
    const val = iter.value();
    if (!val) {
      return node.element;
    }
    if (node.element) {
      element = node.element;
    }
    node = node.children.get(val);
    iter.next();
  }
  return element;
}`,
  },
  {
    repoFullName: 'hashicorp/terraform',
    repoName: 'terraform',
    repoUrl: 'https://github.com/hashicorp/terraform',
    stars: 42000,
    filePath: 'internal/dag/walk.go',
    functionName: 'Walk',
    language: 'Go',
    startLine: 52,
    endLine: 91,
    sourceUrl: 'https://github.com/hashicorp/terraform/blob/main/internal/dag/walk.go#L52-L91',
    rationale: 'Terraform models infrastructure resources as a Directed Acyclic Graph (DAG) and uses Topological Sort to execute resource provisioning. Dependencies (like VPCs before EC2 instances) are calculated via Kahn/DFS ordering.',
    productionContext: 'Terraform Resource Dependency Graph Engine',
    confidenceScore: 0.99,
    tags: ['graph', 'topological-sort', 'depth-first-search'],
    codeSnippet: `func (w *Walker) Walk(g *AcyclicGraph) {
  // Compute in-degrees of every resource vertex in the DAG
  inDegrees := make(map[Vertex]int)
  for _, v := range g.Vertices() {
    inDegrees[v] = g.UpEdges(v).Len()
    if inDegrees[v] == 0 {
      w.queue.Push(v)
    }
  }

  // Drain vertices with 0 in-degree concurrently
  for w.queue.Len() > 0 {
    v := w.queue.Pop()
    go func(node Vertex) {
      w.Callback(node)
      for _, target := range g.DownEdges(node) {
        if atomic.AddInt32(&inDegrees[target], -1) == 0 {
          w.queue.Push(target)
        }
      }
    }(v)
  }
}`,
  },
  {
    repoFullName: 'redis/redis',
    repoName: 'redis',
    repoUrl: 'https://github.com/redis/redis',
    stars: 67000,
    filePath: 'src/rax.c',
    functionName: 'raxInsert',
    language: 'C',
    startLine: 512,
    endLine: 550,
    sourceUrl: 'https://github.com/redis/redis/blob/unstable/src/rax.c#L512-L550',
    rationale: 'Redis Rax is a compact Radix Tree (compressed trie) used for cluster slot routing and Redis Streams. Nodes with single children compress multiple characters into a single node, slashing memory overhead by 70%.',
    productionContext: 'Redis Cluster Routing & Redis Streams Engine',
    confidenceScore: 0.97,
    tags: ['trie', 'tree'],
    codeSnippet: `int raxInsert(rax *rax, unsigned char *s, size_t len, void *data, void **old) {
  raxNode *h;
  int j = 0;
  
  // Traverse matching existing prefix bytes in radix node
  while (j < len && (h = raxFindChild(h, s[j])) != NULL) {
    if (h->iscompr) {
      size_t match = raxCompareCompressed(h, s + j, len - j);
      if (match != h->size) {
        return raxSplitNode(rax, h, s + j, match, data, old);
      }
      j += h->size;
    } else {
      j++;
    }
  }
  return raxAddChild(rax, h, s + j, len - j, data, old);
}`,
  },
  {
    repoFullName: 'torvalds/linux',
    repoName: 'linux',
    repoUrl: 'https://github.com/torvalds/linux',
    stars: 185000,
    filePath: 'lib/rbtree.c',
    functionName: 'rb_insert_color',
    language: 'C',
    startLine: 95,
    endLine: 135,
    sourceUrl: 'https://github.com/torvalds/linux/blob/master/lib/rbtree.c#L95-L135',
    rationale: 'The Linux kernel CFS (Completely Fair Scheduler) uses a self-balancing Red-Black Tree to schedule tasks according to virtual runtime. Inserting a process rebalances tree colors and rotations in O(log n).',
    productionContext: 'Linux Kernel CFS (Completely Fair Scheduler)',
    confidenceScore: 0.99,
    tags: ['tree', 'binary-search-tree', 'binary-tree'],
    codeSnippet: `void rb_insert_color(struct rb_node *node, struct rb_root *root) {
  struct rb_node *parent, *gparent;

  while ((parent = rb_parent(node)) && rb_is_red(parent)) {
    gparent = rb_parent(parent);

    if (parent == gparent->rb_left) {
      struct rb_node *uncle = gparent->rb_right;
      if (uncle && rb_is_red(uncle)) {
        rb_set_black(uncle);
        rb_set_black(parent);
        rb_set_red(gparent);
        node = gparent;
        continue;
      }
      if (parent->rb_right == node) {
        __rb_rotate_left(parent, root);
        node = parent;
        parent = rb_parent(node);
      }
      rb_set_black(parent);
      rb_set_red(gparent);
      __rb_rotate_right(gparent, root);
    }
  }
  rb_set_black(root->rb_node);
}`,
  },
  {
    repoFullName: 'nodejs/node',
    repoName: 'node',
    repoUrl: 'https://github.com/nodejs/node',
    stars: 108000,
    filePath: 'lib/internal/priority_queue.js',
    functionName: 'shiftDown',
    language: 'JavaScript',
    startLine: 80,
    endLine: 115,
    sourceUrl: 'https://github.com/nodejs/node/blob/main/lib/internal/priority_queue.js#L80-L115',
    rationale: 'Node.js event loop uses a binary priority queue for setTimeout timers. The closest timer to expire is always at root index 0, allowing next-timer checks in O(1) time before poll phase.',
    productionContext: 'Node.js Libuv Timer Wheel & Event Loop',
    confidenceScore: 0.98,
    tags: ['heap-priority-queue'],
    codeSnippet: `shiftDown(pos) {
  const heap = this.heap;
  const compare = this.comparator;
  const length = this.length;
  const halfLength = length >>> 1;

  while (pos < halfLength) {
    let child = (pos << 1) + 1;
    const right = child + 1;

    if (right < length && compare(heap[right], heap[child]) < 0) {
      child = right;
    }

    if (compare(heap[child], heap[pos]) >= 0) break;

    const tmp = heap[pos];
    heap[pos] = heap[child];
    heap[child] = tmp;
    pos = child;
  }
}`,
  },
  {
    repoFullName: 'git/git',
    repoName: 'git',
    repoUrl: 'https://github.com/git/git',
    stars: 55000,
    filePath: 'revision.c',
    functionName: 'sort_in_topological_order',
    language: 'C',
    startLine: 3100,
    endLine: 3138,
    sourceUrl: 'https://github.com/git/git/blob/master/revision.c#L3100-L3138',
    rationale: 'Git models commit history as a Directed Acyclic Graph (DAG) with commit parents as directed edges. Topological sorting ensures git log and merge-base calculations visit children strictly before parents.',
    productionContext: 'Git Commit Graph & Revision Walker',
    confidenceScore: 0.99,
    tags: ['graph', 'topological-sort', 'breadth-first-search'],
    codeSnippet: `static void sort_in_topological_order(struct commit_list **list, enum sort_order sort_order) {
  struct commit_list *next = *list, *rem = NULL;
  struct topo_walk_info *info = init_topo_walk_info();

  // Populate indegrees of all commit objects in graph
  while (next) {
    struct commit *c = next->item;
    record_indegree(info, c);
    next = next->next;
  }

  // Queue zero-indegree tips into the traversal priority queue
  while (info->topo_queue.nr) {
    struct commit *commit = prio_queue_get(&info->topo_queue);
    commit_list_append(commit, &rem);
    decrement_parent_indegrees(info, commit);
  }
  *list = rem;
}`,
  },
  {
    repoFullName: 'facebook/rocksdb',
    repoName: 'rocksdb',
    repoUrl: 'https://github.com/facebook/rocksdb',
    stars: 28000,
    filePath: 'cache/lru_cache.cc',
    functionName: 'LRU_Remove',
    language: 'C++',
    startLine: 140,
    endLine: 175,
    sourceUrl: 'https://github.com/facebook/rocksdb/blob/main/cache/lru_cache.cc#L140-L175',
    rationale: 'RocksDB uncompressed block cache implements an LRU (Least Recently Used) cache with hash table plus circular doubly linked list. Evicting the tail takes strict O(1) time without stopping concurrent read queries.',
    productionContext: 'RocksDB Uncompressed Block Cache',
    confidenceScore: 0.99,
    tags: ['lru-cache', 'hash-table', 'doubly-linked-list', 'design'],
    codeSnippet: `void LRUHandleTable::LRU_Remove(LRUHandle* e) {
  e->next->prev = e->prev;
  e->prev->next = e->next;
}

void LRUHandleTable::LRU_Append(LRUHandle* list, LRUHandle* e) {
  // Make "e" newest entry by inserting just before list head
  e->next = list;
  e->prev = list->prev;
  e->prev->next = e;
  e->next->prev = e;
}`,
  },
  {
    repoFullName: 'python/cpython',
    repoName: 'cpython',
    repoUrl: 'https://github.com/python/cpython',
    stars: 65000,
    filePath: 'Lib/heapq.py',
    functionName: '_siftdown',
    language: 'Python',
    startLine: 240,
    endLine: 275,
    sourceUrl: 'https://github.com/python/cpython/blob/main/Lib/heapq.py#L240-L275',
    rationale: 'Python standard library heapq module provides zero-indexed binary min-heap algorithms. Sift-down restores min-heap property when replacing root in O(log n).',
    productionContext: 'Python CPython Standard Library heapq',
    confidenceScore: 0.99,
    tags: ['heap-priority-queue'],
    codeSnippet: `def _siftdown(heap, startpos, pos):
    newitem = heap[pos]
    # Follow the path to the root, moving parents down until finding a place
    # newitem fits.
    while pos > startpos:
        parentpos = (pos - 1) >> 1
        parent = heap[parentpos]
        if newitem < parent:
            heap[pos] = parent
            pos = parentpos
            continue
        break
    heap[pos] = newitem`,
  },
  {
    repoFullName: 'facebook/folly',
    repoName: 'folly',
    repoUrl: 'https://github.com/facebook/folly',
    stars: 28000,
    filePath: 'folly/DisjointSets.h',
    functionName: 'find',
    language: 'C++',
    startLine: 65,
    endLine: 95,
    sourceUrl: 'https://github.com/facebook/folly/blob/main/folly/DisjointSets.h#L65-L95',
    rationale: 'Folly DisjointSets implements Union-Find with full two-pass path compression and union-by-rank. Used in distributed network topology and clustering with inverse Ackermann α(n) near-O(1) runtime.',
    productionContext: 'Meta Folly High-Performance Network Clustering',
    confidenceScore: 0.99,
    tags: ['union-find', 'graph'],
    codeSnippet: `std::size_t find(std::size_t element) {
  std::size_t root = element;
  while (root != parents_[root]) {
    root = parents_[root];
  }
  // Two-pass path compression: flatten tree so all nodes point to root
  while (element != root) {
    std::size_t next = parents_[element];
    parents_[element] = root;
    element = next;
  }
  return root;
}`,
  },
];
