import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

export interface UserMemory {
  id?: string;
  user_id: string;
  memory_key: string;
  memory_text: string;
  category?: string | null;
  created_at?: string;
  updated_at?: string;
}

function buildMemoryKey(memoryText: string, category: string = 'general') {
  const normalized = memoryText.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${category}:${createHash('sha1').update(normalized).digest('hex')}`;
}

function isMissingRelationError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01' || message.includes('relation') || message.includes('does not exist');
}

export async function getUserMemories(userId: string, limit: number = 20): Promise<UserMemory[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (!isMissingRelationError(error)) {
        console.error('Error fetching user memories:', error);
      }
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserMemories:', error);
    return [];
  }
}

export async function saveUserMemory(
  userId: string,
  memoryText: string,
  category: string = 'general',
): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const trimmedText = memoryText.trim();
    if (!trimmedText) return false;

    const { error } = await supabase
      .from('user_memories')
      .upsert({
        user_id: userId,
        memory_key: buildMemoryKey(trimmedText, category),
        memory_text: trimmedText,
        category,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'memory_key'
      });

    if (error) {
      if (!isMissingRelationError(error)) {
        console.error('Error saving user memory:', error);
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in saveUserMemory:', error);
    return false;
  }
}

export async function forgetUserMemories(userId: string, query: string): Promise<number> {
  try {
    const supabase = getSupabase();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return 0;

    const { data: matches, error: selectError } = await supabase
      .from('user_memories')
      .select('id')
      .eq('user_id', userId)
      .ilike('memory_text', `%${trimmedQuery}%`);

    if (selectError) {
      if (!isMissingRelationError(selectError)) {
        console.error('Error selecting user memories to forget:', selectError);
      }
      return 0;
    }

    const ids = matches?.map((match) => match.id).filter(Boolean) || [];
    if (ids.length === 0) return 0;

    const { error } = await supabase
      .from('user_memories')
      .delete()
      .in('id', ids);

    if (error) {
      if (!isMissingRelationError(error)) {
        console.error('Error deleting user memories:', error);
      }
      return 0;
    }

    return ids.length;
  } catch (error) {
    console.error('Error in forgetUserMemories:', error);
    return 0;
  }
}

export function formatUserMemoriesSummary(memories: UserMemory[], langCode: string): string {
  if (!memories.length) {
    if (langCode === 'es') return 'No hay recuerdos guardados del usuario.';
    if (langCode === 'fi') return 'Tallennettuja muistoja ei ole.';
    if (langCode === 'sv') return 'Det finns inga sparade minnen.';
    return 'No saved user memories.';
  }

  return memories
    .slice(0, 12)
    .map((memory) => `- ${memory.memory_text}`)
    .join('\n');
}
