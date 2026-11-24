declare const chrome: {
  runtime?: { lastError?: { message?: string } };
  bookmarks?: { getTree: (callback: (tree: any[]) => void) => void };
};

declare const browser: {
  bookmarks?: { getTree: () => Promise<any[]> };
};
