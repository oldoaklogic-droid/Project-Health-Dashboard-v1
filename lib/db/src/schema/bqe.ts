import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bqeConnectionTable = pgTable("bqe_connection", {
  id: integer("id").primaryKey(),
  refreshToken: text("refresh_token").notNull(),
  apiEndpoint: text("api_endpoint"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BqeConnection = typeof bqeConnectionTable.$inferSelect;