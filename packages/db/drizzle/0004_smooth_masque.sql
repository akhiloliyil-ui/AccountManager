ALTER TABLE "transactions" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
-- Scheduled payments already in the past were settled before bills existed; only future ones need confirming.
UPDATE "transactions" SET "paid_at" = now() WHERE "schedule_id" IS NOT NULL AND "date" < current_date;
