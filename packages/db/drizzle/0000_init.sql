CREATE TABLE "account_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"include_in_totals" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"note" text,
	"limit_amount" bigint,
	"interest_rate" real,
	"counterparty" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"emoji" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern" text NOT NULL,
	"category_id" text NOT NULL,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer DEFAULT 2 NOT NULL,
	"per_base" double precision NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"period_start" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"store_id" text,
	"estimated_fils" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grocery_purchases_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer NOT NULL,
	"imported_count" integer NOT NULL,
	"skipped_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"product_id" text,
	"text" text,
	"quantity" real DEFAULT 1 NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"purchase_id" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pdf_import_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"line" integer NOT NULL,
	"raw_text" text NOT NULL,
	"name" text NOT NULL,
	"product_id" text,
	"match_score" real,
	"price_fils" integer NOT NULL,
	"regular_fils" integer,
	"promo" jsonb,
	"include" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pdf_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"store_id" text,
	"status" text DEFAULT 'review' NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"valid_to" date,
	"file" "bytea",
	"text_length" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"category_id" text NOT NULL,
	"pack_size" real DEFAULT 1 NOT NULL,
	"pack_unit" text DEFAULT 'piece' NOT NULL,
	"sold_by" text DEFAULT 'each' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_prices" (
	"product_id" text NOT NULL,
	"store_id" text NOT NULL,
	"price_fils" integer NOT NULL,
	"promo" jsonb,
	"promo_valid_to" date,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_label" text,
	"pdf_import_id" text,
	"observed_at" date NOT NULL,
	CONSTRAINT "store_prices_product_id_store_id_pk" PRIMARY KEY("product_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"date" date NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"amount" bigint NOT NULL,
	"to_amount" bigint,
	"category_id" text,
	"note" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"parent_id" text,
	"schedule_id" text,
	"schedule_no" integer,
	"schedule_count" integer,
	"import_batch_id" text,
	"import_hash" text,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_shape" CHECK (("transactions"."type" = 'transfer' AND "transactions"."to_account_id" IS NOT NULL AND "transactions"."to_account_id" <> "transactions"."account_id")
          OR ("transactions"."type" <> 'transfer' AND "transactions"."to_account_id" IS NULL)),
	CONSTRAINT "transactions_amount_sign" CHECK ("transactions"."type" = 'adjustment' OR "transactions"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_group_id_account_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."account_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_purchases" ADD CONSTRAINT "grocery_purchases_list_id_grocery_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."grocery_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_purchases" ADD CONSTRAINT "grocery_purchases_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_purchases" ADD CONSTRAINT "grocery_purchases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_grocery_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."grocery_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_purchase_id_grocery_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."grocery_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_import_lines" ADD CONSTRAINT "pdf_import_lines_import_id_pdf_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."pdf_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_import_lines" ADD CONSTRAINT "pdf_import_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_imports" ADD CONSTRAINT "pdf_imports_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_grocery_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."grocery_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_prices" ADD CONSTRAINT "store_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_prices" ADD CONSTRAINT "store_prices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_parent_id_transactions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_group_idx" ON "accounts" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "list_items_list_idx" ON "list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "pdf_import_lines_import_idx" ON "pdf_import_lines" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_to_account_idx" ON "transactions" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_schedule_idx" ON "transactions" USING btree ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_import_hash_idx" ON "transactions" USING btree ("account_id","import_hash");