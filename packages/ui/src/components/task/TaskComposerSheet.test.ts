import { describe, it, expect } from 'vitest';
import {
  extractGroupNumber,
  generateTaskId,
} from './TaskComposerSheet';

describe('TaskComposerSheet ID auto-generation', () => {
  describe('extractGroupNumber', () => {
    it('extracts number from group id with prefix', () => {
      expect(extractGroupNumber('phase-1', 0)).toBe(1);
      expect(extractGroupNumber('group-2', 1)).toBe(2);
      expect(extractGroupNumber('phase_3', 2)).toBe(3);
      expect(extractGroupNumber('4', 3)).toBe(4);
    });

    it('falls back to 1-based index if no number in group id', () => {
      expect(extractGroupNumber('foundation', 0)).toBe(1);
      expect(extractGroupNumber('backend', 1)).toBe(2);
      expect(extractGroupNumber('', 2)).toBe(3);
    });
  });

  describe('generateTaskId with Parent Task selected', () => {
    it('suggests <parentId>.<availableNumber> when parent is 1.1 and has subtasks 1.1.1, 1.1.2', () => {
      const existingTasks = [
        { id: '1', parentId: null, groupId: 'phase-1' },
        { id: '1.1', parentId: '1', groupId: 'phase-1' },
        { id: '1.1.1', parentId: '1.1', groupId: 'phase-1' },
        { id: '1.1.2', parentId: '1.1', groupId: 'phase-1' },
      ];

      const nextId = generateTaskId({
        parentId: '1.1',
        groupId: 'phase-1',
        groupIndex: 0,
        tasks: existingTasks,
      });

      expect(nextId).toBe('1.1.3');
    });

    it('suggests <parentId>.1 when parent has no subtasks yet', () => {
      const existingTasks = [
        { id: '1', parentId: null, groupId: 'phase-1' },
        { id: '1.1', parentId: '1', groupId: 'phase-1' },
      ];

      const nextId = generateTaskId({
        parentId: '1.1',
        groupId: 'phase-1',
        groupIndex: 0,
        tasks: existingTasks,
      });

      expect(nextId).toBe('1.1.1');
    });

    it('suggests next child for top-level parent 1 with existing children 1.1, 1.2', () => {
      const existingTasks = [
        { id: '1', parentId: null, groupId: 'phase-1' },
        { id: '1.1', parentId: '1', groupId: 'phase-1' },
        { id: '1.2', parentId: '1', groupId: 'phase-1' },
      ];

      const nextId = generateTaskId({
        parentId: '1',
        groupId: 'phase-1',
        groupIndex: 0,
        tasks: existingTasks,
      });

      expect(nextId).toBe('1.3');
    });

    it('handles non-numeric parent id like "auth"', () => {
      const existingTasks = [
        { id: 'auth', parentId: null, groupId: 'phase-1' },
        { id: 'auth.1', parentId: 'auth', groupId: 'phase-1' },
      ];

      const nextId = generateTaskId({
        parentId: 'auth',
        groupId: 'phase-1',
        groupIndex: 0,
        tasks: existingTasks,
      });

      expect(nextId).toBe('auth.2');
    });
  });

  describe('generateTaskId with NO Parent Task (Top-level)', () => {
    it('suggests 2.3 if group 2 has tasks 2.1, 2.2', () => {
      const existingTasks = [
        { id: '1', parentId: null, groupId: 'phase-1' },
        { id: '1.1', parentId: '1', groupId: 'phase-1' },
        { id: '2.1', parentId: null, groupId: 'phase-2' },
        { id: '2.2', parentId: null, groupId: 'phase-2' },
      ];

      const nextId = generateTaskId({
        parentId: null,
        groupId: 'phase-2',
        groupIndex: 1,
        tasks: existingTasks,
      });

      expect(nextId).toBe('2.3');
    });

    it('suggests 1.1 if group 1 has no tasks', () => {
      const existingTasks: Array<{ id: string; parentId?: string | null; groupId?: string }> = [];

      const nextId = generateTaskId({
        parentId: null,
        groupId: 'phase-1',
        groupIndex: 0,
        tasks: existingTasks,
      });

      expect(nextId).toBe('1.1');
    });

    it('suggests 3.1 for group 3 with no existing tasks', () => {
      const existingTasks = [
        { id: '1.1', parentId: null, groupId: 'phase-1' },
        { id: '2.1', parentId: null, groupId: 'phase-2' },
      ];

      const nextId = generateTaskId({
        parentId: null,
        groupId: 'phase-3',
        groupIndex: 2,
        tasks: existingTasks,
      });

      expect(nextId).toBe('3.1');
    });
  });
});
