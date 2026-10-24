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
  commitSha: string;
  rationale: string;
  productionContext: string;
  confidenceScore: number;
  tags: string[];
  codeSnippet: string;
  isUnresolved?: boolean;
}

/**
 * Helper to construct immutable SHA-pinned GitHub source permalink.
 */
export function buildSeedPermalink(
  repoUrl: string,
  commitSha: string,
  filePath: string,
  startLine: number,
  endLine: number
): string {
  const cleanRepo = repoUrl.replace(/\/$/, '');
  const cleanPath = filePath.replace(/^\//, '');
  const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
  return `${cleanRepo}/blob/${commitSha}/${encodedPath}#L${startLine}-L${endLine}`;
}

export const SEED_EXAMPLES: SeedExample[] = [
  {
    repoFullName: 'facebook/react',
    repoName: 'react',
    repoUrl: 'https://github.com/facebook/react',
    stars: 228000,
    filePath: 'packages/scheduler/src/SchedulerMinHeap.js',
    functionName: 'siftDown',
    language: 'JavaScript',
    startLine: 59,
    endLine: 88,
    sourceUrl: 'https://github.com/facebook/react/blob/fbb137059e4aacfaab1d36516e9b55050b4a0454/packages/scheduler/src/SchedulerMinHeap.js#L59-L88',
    commitSha: 'fbb137059e4aacfaab1d36516e9b55050b4a0454',
    rationale: 'React Scheduler uses a binary min-heap to keep track of concurrent tasks ordered by expiration time. Sift-down restores the heap invariant in O(log n) when the earliest deadline task is popped during browser idle frames.',
    productionContext: 'React Concurrent Mode Scheduler',
    confidenceScore: 0.99,
    tags: ['heap-priority-queue'],
    codeSnippet: `function siftDown<T: Node>(heap: Heap<T>, node: T, i: number): void {
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
  }`,
  },
  {
    repoFullName: 'microsoft/vscode',
    repoName: 'vscode',
    repoUrl: 'https://github.com/microsoft/vscode',
    stars: 163000,
    filePath: 'src/vs/base/common/ternarySearchTree.ts',
    functionName: 'findSubstr',
    language: 'TypeScript',
    startLine: 682,
    endLine: 704,
    sourceUrl: 'https://github.com/microsoft/vscode/blob/2b196e8fb281a39a4a6b2e9fd538fdc29cb83efa/src/vs/base/common/ternarySearchTree.ts#L682-L704',
    commitSha: '2b196e8fb281a39a4a6b2e9fd538fdc29cb83efa',
    rationale: 'VS Code implements a Ternary Search Tree (Trie) for fast workspace URI lookup and prefix matching. Traversing trie edges by path segments allows O(k) longest-prefix route matching rather than scanning thousands of open files.',
    productionContext: 'Monaco Editor Workspace URI Router & Autocomplete',
    confidenceScore: 0.98,
    tags: ['trie', 'tree', 'design'],
    codeSnippet: `	findSubstr(key: K): V | undefined {
		const iter = this._iter.reset(key);
		let node = this._root;
		let candidate: V | undefined = undefined;
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				candidate = Undef.unwrap(node.value) || candidate;
				node = node.mid;
			} else {
				break;
			}
		}
		return node && Undef.unwrap(node.value) || candidate;
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
    startLine: 100,
    endLine: 211,
    sourceUrl: 'https://github.com/hashicorp/terraform/blob/55988303ba5651e41e2c9097e208468c8eb3da4b/internal/dag/walk.go#L100-L211',
    commitSha: '55988303ba5651e41e2c9097e208468c8eb3da4b',
    rationale: 'Terraform models infrastructure resources as a Directed Acyclic Graph (DAG) and uses Topological Sort to execute resource provisioning. Dependencies (like VPCs before EC2 instances) are calculated via Kahn/DFS ordering.',
    productionContext: 'Terraform Resource Dependency Graph Engine',
    confidenceScore: 0.99,
    tags: ['graph', 'topological-sort', 'depth-first-search'],
    codeSnippet: `func (w *Walker) Walk(g *AcyclicGraph) tfdiags.Diagnostics {
	if g == nil {
		return nil
	}

	if w.started.Load() {
		panic("graph walker already started")
	}
	w.started.Store(true)

	// Initialize fields
	if w.vertexMap == nil {
		w.vertexMap = make(map[Vertex]*walkerVertex)
	}

	// Add the new vertices
	for v := range g.vertices.All() {
		// Add to the waitgroup so our walk is not done until everything finishes
		w.wait.Add(1)

		// Add to our own set so we know about it already
		w.vertices.Add(v)

		// Initialize the vertex info
		info := &walkerVertex{
			DoneCh:   make(chan struct{}),
			CancelCh: make(chan struct{}),
			deps:     make(map[Vertex]chan struct{}),
		}

		// Add it to the map and kick off the walk
		w.vertexMap[v] = info
	}

	// Iterate over all edges so we can connect the waiters to their
	// dependencies channels.
	for waiter, deps := range g.edgesFrom {
		for dep := range deps.All() {
			// Get the info for the waiter
			waiterInfo, ok := w.vertexMap[waiter]
			if !ok {
				// Vertex doesn't exist... shouldn't be possible but ignore.
				continue
			}

			// Get the info for the dep
			depInfo, ok := w.vertexMap[dep]
			if !ok {
				// Vertex doesn't exist... shouldn't be possible but ignore.
				continue
			}

			// Add the dependency to our waiter
			waiterInfo.deps[dep] = depInfo.DoneCh
		}
	}

	// kick off a new waiter and notify the vertex of the changes.
	for v := range g.edgesFrom {
		info, ok := w.vertexMap[v]
		if !ok {
			// Vertex doesn't exist... shouldn't be possible but ignore.
			continue
		}

		// Create a new done channel
		doneCh := make(chan bool, 1)

		// Create the channel we close for cancellation
		cancelCh := make(chan struct{})

		// Build a new deps copy
		deps := make(map[Vertex]<-chan struct{})
		for k, v := range info.deps {
			deps[k] = v
		}

		info.DepsCh = doneCh

		// Cancel the older waiter
		if info.depsCancelCh != nil {
			close(info.depsCancelCh)
		}
		info.depsCancelCh = cancelCh

		// Start the waiter
		go w.waitDeps(v, deps, doneCh, cancelCh)
	}

	// Start all the new vertices. We do this at the end so that all
	// the edge waiters and changes are set up above.
	for v, info := range w.vertexMap {
		go w.walkVertex(v, info)
	}

	// Wait for completion
	w.wait.Wait()

	var diags tfdiags.Diagnostics
	w.diagsLock.Lock()
	for v, vDiags := range w.diagsMap {
		if _, upstream := w.upstreamFailed[v]; upstream {
			// Ignore diagnostics for nodes that had failed upstreams, since
			// the downstream diagnostics are likely to be redundant.
			continue
		}
		diags = diags.Append(vDiags)
	}
	w.diagsLock.Unlock()

	return diags
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
    startLine: 1217,
    endLine: 1221,
    sourceUrl: 'https://github.com/redis/redis/blob/c039dd784ca6139314880631de162f65dda25d45/src/rax.c#L1217-L1221',
    commitSha: 'c039dd784ca6139314880631de162f65dda25d45',
    rationale: 'Redis Rax is a compact Radix Tree (compressed trie) used for cluster slot routing and Redis Streams. Nodes with single children compress multiple characters into a single node, slashing memory overhead by 70%.',
    productionContext: 'Redis Cluster Routing & Redis Streams Engine',
    confidenceScore: 0.97,
    tags: ['trie', 'tree'],
    codeSnippet: `int raxInsert(rax *rax, unsigned char *s, size_t len, void *data, void **old) {
    raxNodeLink link;
    raxFindLink(rax, s, len, NULL, &link);
    return raxInsertAt(rax,s,len,data,old,&link);
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
    startLine: 434,
    endLine: 437,
    sourceUrl: 'https://github.com/torvalds/linux/blob/5b0764a53235d3c77e1ed674e836e1b3fe1a4b1f/lib/rbtree.c#L434-L437',
    commitSha: '5b0764a53235d3c77e1ed674e836e1b3fe1a4b1f',
    rationale: 'The Linux kernel CFS (Completely Fair Scheduler) uses a self-balancing Red-Black Tree to schedule tasks according to virtual runtime. Inserting a process rebalances tree colors and rotations in O(log n).',
    productionContext: 'Linux Kernel CFS (Completely Fair Scheduler)',
    confidenceScore: 0.99,
    tags: ['tree', 'binary-search-tree', 'binary-tree'],
    codeSnippet: `void rb_insert_color(struct rb_node *node, struct rb_root *root)
{
	__rb_insert(node, root, dummy_rotate);
}`,
  },
  {
    repoFullName: 'nodejs/node',
    repoName: 'node',
    repoUrl: 'https://github.com/nodejs/node',
    stars: 108000,
    filePath: 'lib/internal/priority_queue.js',
    functionName: 'percolateDown',
    language: 'JavaScript',
    startLine: 38,
    endLine: 69,
    sourceUrl: 'https://github.com/nodejs/node/blob/763524d434aa6b40fecbaf088b0fa788b3aa0375/lib/internal/priority_queue.js#L38-L69',
    commitSha: '763524d434aa6b40fecbaf088b0fa788b3aa0375',
    rationale: 'Node.js event loop uses a binary priority queue for setTimeout timers. The closest timer to expire is always at root index 1, restoring heap ordering in O(log n) via percolateDown.',
    productionContext: 'Node.js Libuv Timer Wheel & Event Loop',
    confidenceScore: 0.98,
    tags: ['heap-priority-queue'],
    codeSnippet: `  percolateDown(pos) {
    const compare = this.#compare;
    const setPosition = this.#setPosition;
    const hasSetPosition = setPosition !== undefined;
    const heap = this.#heap;
    const size = this.#size;
    const hsize = size >> 1;
    const item = heap[pos];

    while (pos <= hsize) {
      let child = pos << 1;
      const nextChild = child + 1;
      let childItem = heap[child];

      if (nextChild <= size && compare(heap[nextChild], childItem) < 0) {
        child = nextChild;
        childItem = heap[nextChild];
      }

      if (compare(item, childItem) <= 0) break;

      if (hasSetPosition)
        setPosition(childItem, pos);

      heap[pos] = childItem;
      pos = child;
    }

    heap[pos] = item;
    if (hasSetPosition)
      setPosition(item, pos);
  }`,
  },
  {
    repoFullName: 'git/git',
    repoName: 'git',
    repoUrl: 'https://github.com/git/git',
    stars: 55000,
    filePath: 'commit.c',
    functionName: 'sort_in_topological_order',
    language: 'C',
    startLine: 938,
    endLine: 1047,
    sourceUrl: 'https://github.com/git/git/blob/7e34d8174dcda3435d1404c9a30bef46afe6c13e/commit.c#L938-L1047',
    commitSha: '7e34d8174dcda3435d1404c9a30bef46afe6c13e',
    rationale: 'Git models commit history as a Directed Acyclic Graph (DAG) with commit parents as directed edges. Topological sorting ensures git log and merge-base calculations visit children strictly before parents.',
    productionContext: 'Git Commit Graph & Revision Walker',
    confidenceScore: 0.99,
    tags: ['graph', 'topological-sort', 'breadth-first-search'],
    codeSnippet: `void sort_in_topological_order(struct commit_list **list, enum rev_sort_order sort_order)
{
	struct commit_list *next, *orig = *list;
	struct commit_list **pptr;
	struct indegree_slab indegree;
	struct prio_queue queue;
	struct commit *commit;
	struct author_date_slab author_date;

	if (!orig)
		return;
	*list = NULL;

	init_indegree_slab(&indegree);
	memset(&queue, '\\0', sizeof(queue));

	switch (sort_order) {
	default: /* REV_SORT_IN_GRAPH_ORDER */
		queue.compare = NULL;
		break;
	case REV_SORT_BY_COMMIT_DATE:
		queue.compare = compare_commits_by_commit_date;
		break;
	case REV_SORT_BY_AUTHOR_DATE:
		init_author_date_slab(&author_date);
		queue.compare = compare_commits_by_author_date;
		queue.cb_data = &author_date;
		break;
	}

	/* Mark them and clear the indegree */
	for (next = orig; next; next = next->next) {
		struct commit *commit = next->item;
		*(indegree_slab_at(&indegree, commit)) = 1;
		/* also record the author dates, if needed */
		if (sort_order == REV_SORT_BY_AUTHOR_DATE)
			record_author_date(&author_date, commit);
	}

	/* update the indegree */
	for (next = orig; next; next = next->next) {
		struct commit_list *parents = next->item->parents;
		while (parents) {
			struct commit *parent = parents->item;
			int *pi = indegree_slab_at(&indegree, parent);

			if (*pi)
				(*pi)++;
			parents = parents->next;
		}
	}

	/*
	 * find the tips
	 *
	 * tips are nodes not reachable from any other node in the list
	 *
	 * the tips serve as a starting set for the work queue.
	 */
	for (next = orig; next; next = next->next) {
		struct commit *commit = next->item;

		if (*(indegree_slab_at(&indegree, commit)) == 1)
			prio_queue_put(&queue, commit);
	}

	/*
	 * This is unfortunate; the initial tips need to be shown
	 * in the order given from the revision traversal machinery.
	 */
	if (sort_order == REV_SORT_IN_GRAPH_ORDER)
		prio_queue_reverse(&queue);

	/* We no longer need the commit list */
	commit_list_free(orig);

	pptr = list;
	*list = NULL;
	while ((commit = prio_queue_get(&queue)) != NULL) {
		struct commit_list *parents;

		for (parents = commit->parents; parents ; parents = parents->next) {
			struct commit *parent = parents->item;
			int *pi = indegree_slab_at(&indegree, parent);

			if (!*pi)
				continue;

			/*
			 * parents are only enqueued for emission
			 * when all their children have been emitted thereby
			 * guaranteeing topological order.
			 */
			if (--(*pi) == 1)
				prio_queue_put(&queue, parent);
		}
		/*
		 * all children of commit have already been
		 * emitted. we can emit it now.
		 */
		*(indegree_slab_at(&indegree, commit)) = 0;

		pptr = &commit_list_insert(commit, pptr)->next;
	}

	clear_indegree_slab(&indegree);
	clear_prio_queue(&queue);
	if (sort_order == REV_SORT_BY_AUTHOR_DATE)
		clear_author_date_slab(&author_date);
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
    startLine: 232,
    endLine: 254,
    sourceUrl: 'https://github.com/facebook/rocksdb/blob/ea313605367281013c2c81158069e88411516357/cache/lru_cache.cc#L232-L254',
    commitSha: 'ea313605367281013c2c81158069e88411516357',
    rationale: 'RocksDB uncompressed block cache implements an LRU (Least Recently Used) cache with hash table plus circular doubly linked list. Evicting the tail takes strict O(1) time without stopping concurrent read queries.',
    productionContext: 'RocksDB Uncompressed Block Cache',
    confidenceScore: 0.99,
    tags: ['lru-cache', 'hash-table', 'doubly-linked-list', 'design'],
    codeSnippet: `void LRUCacheShard::LRU_Remove(LRUHandle* e) {
  assert(e->next != nullptr);
  assert(e->prev != nullptr);
  if (lru_low_pri_ == e) {
    lru_low_pri_ = e->prev;
  }
  if (lru_bottom_pri_ == e) {
    lru_bottom_pri_ = e->prev;
  }
  e->next->prev = e->prev;
  e->prev->next = e->next;
  e->prev = e->next = nullptr;
  assert(lru_usage_ >= e->total_charge);
  lru_usage_ -= e->total_charge;
  assert(!e->InHighPriPool() || !e->InLowPriPool());
  if (e->InHighPriPool()) {
    assert(high_pri_pool_usage_ >= e->total_charge);
    high_pri_pool_usage_ -= e->total_charge;
  } else if (e->InLowPriPool()) {
    assert(low_pri_pool_usage_ >= e->total_charge);
    low_pri_pool_usage_ -= e->total_charge;
  }
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
    startLine: 221,
    endLine: 233,
    sourceUrl: 'https://github.com/python/cpython/blob/94942ba7d957a46961b41152af3fd3af9415930c/Lib/heapq.py#L221-L233',
    commitSha: '94942ba7d957a46961b41152af3fd3af9415930c',
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
    repoFullName: 'networkx/networkx',
    repoName: 'networkx',
    repoUrl: 'https://github.com/networkx/networkx',
    stars: 14400,
    filePath: 'networkx/utils/union_find.py',
    functionName: 'union',
    language: 'Python',
    startLine: 91,
    endLine: 106,
    sourceUrl: 'https://github.com/networkx/networkx/blob/5fcf01b9a43a097c4f579486023d1279b2b88619/networkx/utils/union_find.py#L91-L106',
    commitSha: '5fcf01b9a43a097c4f579486023d1279b2b88619',
    rationale: 'NetworkX implements the classic Union-Find (Disjoint-Set Union) data structure with union-by-weight and two-pass path compression in __getitem__. The union method merges disjoint components by weight while flattening component trees, enabling Kruskal minimum spanning tree and connected component queries in near-O(1) amortized time α(n).',
    productionContext: 'NetworkX Graph Theory & Connectivity Engine',
    confidenceScore: 0.99,
    tags: ['union-find', 'graph'],
    codeSnippet: `    def union(self, *objects):
        """Find the sets containing the objects and merge them all."""
        # Find the heaviest root according to its weight.
        roots = iter(
            sorted(
                {self[x] for x in objects}, key=lambda r: self.weights[r], reverse=True
            )
        )
        try:
            root = next(roots)
        except StopIteration:
            return

        for r in roots:
            self.weights[root] += self.weights[r]
            self.parents[r] = root`,
  },
];
