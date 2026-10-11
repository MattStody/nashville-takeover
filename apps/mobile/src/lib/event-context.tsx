import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Tables } from '@nt/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pickDefaultEvent } from './logic';
import { useEvents } from './queries';

type EventRow = Tables<'events'>;
const KEY = 'nt.selectedEvent';

interface EventState {
  event: EventRow | null;
  mine: EventRow[];
  others: EventRow[];
  isMine: boolean;
  loading: boolean;
  error: Error | null;
  select: (id: string) => void;
  refetch: () => void;
}

const Ctx = createContext<EventState | null>(null);

export function EventProvider({ children }: { children: ReactNode }) {
  const events = useEvents();
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(setChosen).catch(() => {});
  }, []);

  const value = useMemo<EventState>(() => {
    const mine = events.data?.mine ?? [];
    const others = events.data?.others ?? [];
    const all = [...mine, ...others];
    const event = all.find((e) => e.id === chosen) ?? pickDefaultEvent(mine, others);
    return {
      event,
      mine,
      others,
      isMine: !!event && mine.some((e) => e.id === event.id),
      loading: events.isLoading,
      error: events.error,
      select: (id) => {
        setChosen(id);
        AsyncStorage.setItem(KEY, id).catch(() => {});
      },
      refetch: () => void events.refetch(),
    };
  }, [events.data, events.isLoading, events.error, chosen, events]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentEvent(): EventState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCurrentEvent outside EventProvider');
  return v;
}
