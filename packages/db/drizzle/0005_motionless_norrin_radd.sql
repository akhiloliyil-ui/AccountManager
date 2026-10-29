CREATE TABLE "import_formats" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"signature" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"account_id" text,
	"use_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_formats" ADD CONSTRAINT "import_formats_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_formats_signature_key" ON "import_formats" USING btree ("signature");