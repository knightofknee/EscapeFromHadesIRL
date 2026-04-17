export type Tag = {
  id: string;
  userId: string;
  name: string;
  color?: string;
  createdAt: number;
};

export type InlineTag = {
  tagId: string;
  startIndex: number;
  endIndex: number;
};

export type Note = {
  id: string;
  userId: string;
  title: string;
  content: string; // raw markdown
  tags: InlineTag[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean; // currently pinned
  hasBeenPinned?: boolean; // was ever pinned (history for future search)
};
