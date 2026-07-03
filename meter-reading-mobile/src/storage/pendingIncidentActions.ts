import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PendingIncidentAction } from '../types/incidents';

const PENDING_INCIDENT_ACTIONS_KEY = 'naivawasco.pendingIncidentActions';

export async function getPendingIncidentActions(): Promise<PendingIncidentAction[]> {
  const raw = await AsyncStorage.getItem(PENDING_INCIDENT_ACTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePendingIncidentActions(actions: PendingIncidentAction[]) {
  await AsyncStorage.setItem(PENDING_INCIDENT_ACTIONS_KEY, JSON.stringify(actions));
}

export async function queuePendingIncidentAction(action: PendingIncidentAction) {
  const actions = await getPendingIncidentActions();
  await savePendingIncidentActions([...actions, action]);
}

export async function removePendingIncidentAction(localId: string) {
  const actions = await getPendingIncidentActions();
  await savePendingIncidentActions(actions.filter(item => item.localId !== localId));
}
