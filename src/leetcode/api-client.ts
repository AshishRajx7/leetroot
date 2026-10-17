import axios from 'axios';

export interface LeetCodeApiProblem {
  frontendQuestionId: number;
  title: string;
  titleSlug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  topicTags: {
    name: string;
    slug: string;
  }[];
}

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

/**
 * Fetches problem list with tags from LeetCode's public GraphQL endpoint.
 */
export async function fetchLeetCodeProblems(limit: number = 100): Promise<LeetCodeApiProblem[]> {
  const query = `
    query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
      problemsetQuestionList: questionList(
        categorySlug: $categorySlug
        limit: $limit
        skip: $skip
        filters: $filters
      ) {
        total: totalNum
        questions: data {
          frontendQuestionId: questionFrontendId
          title
          titleSlug
          difficulty
          isPaidOnly
          topicTags {
            name
            slug
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      LEETCODE_GRAPHQL_URL,
      {
        query,
        variables: {
          categorySlug: '',
          skip: 0,
          limit,
          filters: {},
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      }
    );

    const questions = response.data?.data?.problemsetQuestionList?.questions || [];
    return questions.map((q: any) => ({
      frontendQuestionId: parseInt(q.frontendQuestionId, 10),
      title: q.title,
      titleSlug: q.titleSlug,
      difficulty: q.difficulty,
      isPaidOnly: Boolean(q.isPaidOnly),
      topicTags: (q.topicTags || []).map((t: any) => ({
        name: t.name,
        slug: t.slug,
      })),
    }));
  } catch (err: any) {
    console.warn('[LeetCode API] Public GraphQL query timed out or failed:', err.message);
    // Return curated core problem list as reliable fallback
    return getCuratedCoreProblems();
  }
}

/**
 * Fallback curated high-yield LeetCode problems (Blind 75 / Top Interview)
 */
export function getCuratedCoreProblems(): LeetCodeApiProblem[] {
  return [
    {
      frontendQuestionId: 23,
      title: 'Merge k Sorted Lists',
      titleSlug: 'merge-k-sorted-lists',
      difficulty: 'Hard',
      isPaidOnly: false,
      topicTags: [
        { name: 'Linked List', slug: 'linked-list' },
        { name: 'Heap (Priority Queue)', slug: 'heap-priority-queue' },
        { name: 'Divide and Conquer', slug: 'divide-and-conquer' },
      ],
    },
    {
      frontendQuestionId: 208,
      title: 'Implement Trie (Prefix Tree)',
      titleSlug: 'implement-trie-prefix-tree',
      difficulty: 'Medium',
      isPaidOnly: false,
      topicTags: [
        { name: 'Trie', slug: 'trie' },
        { name: 'Design', slug: 'design' },
        { name: 'Hash Table', slug: 'hash-table' },
      ],
    },
    {
      frontendQuestionId: 210,
      title: 'Course Schedule II',
      titleSlug: 'course-schedule-ii',
      difficulty: 'Medium',
      isPaidOnly: false,
      topicTags: [
        { name: 'Graph', slug: 'graph' },
        { name: 'Topological Sort', slug: 'topological-sort' },
        { name: 'Breadth-First Search', slug: 'breadth-first-search' },
      ],
    },
    {
      frontendQuestionId: 146,
      title: 'LRU Cache',
      titleSlug: 'lru-cache',
      difficulty: 'Medium',
      isPaidOnly: false,
      topicTags: [
        { name: 'Hash Table', slug: 'hash-table' },
        { name: 'Linked List', slug: 'linked-list' },
        { name: 'Design', slug: 'design' },
        { name: 'Doubly-Linked List', slug: 'doubly-linked-list' },
        { name: 'LRU Cache', slug: 'lru-cache' },
      ],
    },
    {
      frontendQuestionId: 94,
      title: 'Binary Tree Inorder Traversal',
      titleSlug: 'binary-tree-inorder-traversal',
      difficulty: 'Easy',
      isPaidOnly: false,
      topicTags: [
        { name: 'Tree', slug: 'tree' },
        { name: 'Depth-First Search', slug: 'depth-first-search' },
        { name: 'Binary Tree', slug: 'binary-tree' },
      ],
    },
    {
      frontendQuestionId: 200,
      title: 'Number of Islands',
      titleSlug: 'number-of-islands',
      difficulty: 'Medium',
      isPaidOnly: false,
      topicTags: [
        { name: 'Graph', slug: 'graph' },
        { name: 'Breadth-First Search', slug: 'breadth-first-search' },
        { name: 'Depth-First Search', slug: 'depth-first-search' },
        { name: 'Union Find', slug: 'union-find' },
      ],
    },
    {
      frontendQuestionId: 295,
      title: 'Find Median from Data Stream',
      titleSlug: 'find-median-from-data-stream',
      difficulty: 'Hard',
      isPaidOnly: false,
      topicTags: [
        { name: 'Heap (Priority Queue)', slug: 'heap-priority-queue' },
        { name: 'Design', slug: 'design' },
        { name: 'Two Pointers', slug: 'two-pointers' },
      ],
    },
    {
      frontendQuestionId: 3,
      title: 'Longest Substring Without Repeating Characters',
      titleSlug: 'longest-substring-without-repeating-characters',
      difficulty: 'Medium',
      isPaidOnly: false,
      topicTags: [
        { name: 'Hash Table', slug: 'hash-table' },
        { name: 'String', slug: 'string' },
        { name: 'Sliding Window', slug: 'sliding-window' },
      ],
    },
    {
      frontendQuestionId: 739,
      title: 'Daily Temperatures',
      titleSlug: 'daily-temperatures',
      difficulty: 'Medium',
      isPaidOnly: false,
      topicTags: [
        { name: 'Array', slug: 'array' },
        { name: 'Stack', slug: 'stack' },
        { name: 'Monotonic Stack', slug: 'monotonic-stack' },
      ],
    },
    {
      frontendQuestionId: 684,
      title: 'Redundant Connection',
      titleSlug: 'redundant-connection',
      difficulty: 'Medium',
      isPaidOnly: false,
      topicTags: [
        { name: 'Graph', slug: 'graph' },
        { name: 'Union Find', slug: 'union-find' },
        { name: 'Depth-First Search', slug: 'depth-first-search' },
      ],
    },
  ];
}
