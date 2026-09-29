import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const creatorCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { command: string }) =>
    z.object({ command: z.string().max(1_100_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: identity, error } = await context.supabase.auth.getUser();
    if (error || !identity.user?.email_confirmed_at || identity.user.id !== context.userId)
      throw new Error("Verified current account required");
    const { executeCommand, commandSchema } = await import("@/server/creator-service.server");
    return JSON.stringify(
      await executeCommand(context.userId, commandSchema.parse(JSON.parse(data.command))),
    );
  });

export const sharedProposal = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { readSharedProposal } = await import("@/server/creator-service.server");
    return readSharedProposal(data.token);
  });
