import { ColorPreset, Tag } from '@/src/types';

export const INITIAL_COLORS: ColorPreset[] = [
  { id: 1, value: '#ef4444' },
  { id: 2, value: '#ffff00' },
  { id: 3, value: '#3b82f6' },
  { id: 4, value: '#22c55e' },
  { id: 5, value: '#ffffff' },
  { id: 6, value: '#00eaff' },
  { id: 7, value: '#f97316' },
  { id: 8, value: '#d946ef' },
  { id: 9, value: '#000000' },
];

export const DEFAULT_TAGS: Tag[] = [
  { id: '1', name: 'Goal', color: '#22c55e', shortcut: '1', leadLagEnabled: true, preTime: 10, postTime: 10 },
  { id: '2', name: 'Foul', color: '#ef4444', shortcut: '2', leadLagEnabled: false },
  { id: '3', name: 'Shot', color: '#3b82f6', shortcut: '3', leadLagEnabled: false },
  { id: '4', name: 'Corner', color: '#f59e0b', shortcut: '4', leadLagEnabled: false },
  { id: '5', name: 'Pass', color: '#ffffff', shortcut: '5', leadLagEnabled: false },
];
