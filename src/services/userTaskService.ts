import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

function isMissingRelationError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("relation") || message.includes("does not exist");
}

export interface UserTask {
  id?: string;
  user_id: string;
  task_key: string;
  title: string;
  status: "open" | "completed";
  source_text?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

function buildTaskKey(title: string, dueAt?: string | null) {
  const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizedDueAt = dueAt ? new Date(dueAt).toISOString() : "none";
  return createHash("sha1").update(`${normalizedTitle}|${normalizedDueAt}`).digest("hex");
}

export async function getUserTasks(
  userId: string,
  options: {
    status?: "open" | "completed";
    limit?: number;
  } = {},
): Promise<UserTask[]> {
  try {
    const supabase = getSupabase();
    let query = supabase
      .from("user_tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 20);

    if (options.status) {
      query = query.eq("status", options.status);
    }

    const { data, error } = await query;

    if (error) {
      if (!isMissingRelationError(error)) {
        console.error("Error fetching user tasks:", error);
      }
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getUserTasks:", error);
    return [];
  }
}

export async function saveUserTask(
  userId: string,
  title: string,
  options: {
    dueAt?: string | null;
    sourceText?: string | null;
  } = {},
): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return false;

    const dueAt = options.dueAt ? new Date(options.dueAt).toISOString() : null;
    const { error } = await supabase
      .from("user_tasks")
      .upsert(
        {
          user_id: userId,
          task_key: buildTaskKey(trimmedTitle, dueAt),
          title: trimmedTitle,
          status: "open",
          source_text: options.sourceText ?? null,
          due_at: dueAt,
          completed_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "task_key" },
      );

    if (error) {
      if (!isMissingRelationError(error)) {
        console.error("Error saving user task:", error);
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in saveUserTask:", error);
    return false;
  }
}

export async function completeUserTasks(userId: string, query: string): Promise<number> {
  try {
    const supabase = getSupabase();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return 0;

    const { data: matches, error: selectError } = await supabase
      .from("user_tasks")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "open")
      .ilike("title", `%${trimmedQuery}%`);

    if (selectError) {
      if (!isMissingRelationError(selectError)) {
        console.error("Error selecting user tasks to complete:", selectError);
      }
      return 0;
    }

    const ids = matches?.map((match) => match.id).filter(Boolean) || [];
    if (ids.length === 0) return 0;

    const { error } = await supabase
      .from("user_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (error) {
      if (!isMissingRelationError(error)) {
        console.error("Error updating user tasks:", error);
      }
      return 0;
    }

    return ids.length;
  } catch (error) {
    console.error("Error in completeUserTasks:", error);
    return 0;
  }
}

export function formatUserTasksSummary(tasks: UserTask[], langCode: string): string {
  if (!tasks.length) {
    if (langCode === "es") return "No hay tareas abiertas.";
    if (langCode === "fi") return "Avoimia tehtavia ei ole.";
    if (langCode === "sv") return "Det finns inga oppna uppgifter.";
    return "There are no open tasks.";
  }

  return tasks
    .slice(0, 8)
    .map((task) => {
      if (!task.due_at) {
        return `- ${task.title}`;
      }

      const dueDate = new Date(task.due_at);
      const formatted = Number.isNaN(dueDate.getTime())
        ? task.due_at
        : dueDate.toLocaleString(langCode === "es" ? "es-ES" : langCode === "fi" ? "fi-FI" : langCode === "sv" ? "sv-SE" : "en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

      return `- ${task.title} (${formatted})`;
    })
    .join("\n");
}
