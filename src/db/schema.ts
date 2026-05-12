import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }),
  role: varchar("role", { length: 50 }).default("staff").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Registrations ────────────────────────────────────────────────────────────
export const registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),
  srNo: integer("sr_no"),
  timestampRaw: text("timestamp_raw"),
  title: varchar("title", { length: 20 }),
  firstName: varchar("first_name", { length: 120 }),
  lastName: varchar("last_name", { length: 120 }),
  countryName: varchar("country_name", { length: 100 }),
  passportCountry: varchar("passport_country", { length: 100 }),
  region: varchar("region", { length: 100 }),
  participantMobile: varchar("participant_mobile", { length: 50 }),
  participantEmail: varchar("participant_email", { length: 320 }),
  companyName: varchar("company_name", { length: 255 }),
  companyWebsite: varchar("company_website", { length: 500 }),
  designation: varchar("designation", { length: 200 }),
  passportNumber: varchar("passport_number", { length: 50 }),
  placeOfIssue: varchar("place_of_issue", { length: 100 }),
  dateOfExpiry: varchar("date_of_expiry", { length: 30 }),
  passportFrontCopy: text("passport_front_copy"),
  passportBackCopy: text("passport_back_copy"),
  natureOfBusiness: text("nature_of_business"),
  mainImportProduct1: varchar("main_import_product_1", { length: 200 }),
  mainImportProduct2: varchar("main_import_product_2", { length: 200 }),
  proofUpload: text("proof_upload"),
  productsServices: text("products_services"),
  businessCardUpload: text("business_card_upload"),
  poc: varchar("poc", { length: 100 }),
  proofImport: varchar("proof_import", { length: 50 }),
  typeOfPoi: varchar("type_of_poi", { length: 100 }),
  blSupplierCountry: varchar("bl_supplier_country", { length: 100 }),
  blBuyerCountry: varchar("bl_buyer_country", { length: 100 }),
  status: varchar("status", { length: 100 }),
  flightHotelCode: varchar("flight_hotel_code", { length: 20 }),
  remarks: text("remarks"),
  blStatus: varchar("bl_status", { length: 100 }),
  bbInvitationStatus: varchar("bb_invitation_status", { length: 100 }),
  dollarBusiness: varchar("dollar_business", { length: 100 }),
  vujis: varchar("vujis", { length: 100 }),
  // Google Drive file URLs
  drivePassportFrontUrl: text("drive_passport_front_url"),
  drivePassportBackUrl: text("drive_passport_back_url"),
  driveProofUrl: text("drive_proof_url"),
  driveBusinessCardUrl: text("drive_business_card_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Travel Records ───────────────────────────────────────────────────────────
export const travelRecords = pgTable("travel_records", {
  id: serial("id").primaryKey(),
  registrationId: integer("registration_id").references(() => registrations.id, { onDelete: "set null" }),
  responsesSrNo: varchar("responses_sr_no", { length: 20 }),
  roomNo: varchar("room_no", { length: 30 }),
  hotelName: varchar("hotel_name", { length: 255 }),
  initial: varchar("initial", { length: 20 }),
  firstName: varchar("first_name", { length: 120 }),
  lastName: varchar("last_name", { length: 120 }),
  countryName: varchar("country_name", { length: 100 }),
  countryCode: varchar("country_code", { length: 10 }),
  participantMobile: varchar("participant_mobile", { length: 50 }),
  checkInDate: date("check_in_date"),
  checkOutDate: date("check_out_date"),
  roomUnits: numeric("room_units", { precision: 4, scale: 2 }),
  arrivalDate: date("arrival_date"),
  arrivalFlightNo: varchar("arrival_flight_no", { length: 50 }),
  arrivalTo: varchar("arrival_to", { length: 255 }),
  arrivalTime: time("arrival_time"),
  departureDate: date("departure_date"),
  departureFlightNo: varchar("departure_flight_no", { length: 50 }),
  departureFrom: varchar("departure_from", { length: 255 }),
  departureTime: time("departure_time"),
  sector: varchar("sector", { length: 200 }),
  companyName: varchar("company_name", { length: 255 }),
  poc: varchar("poc", { length: 100 }),
  status: varchar("status", { length: 50 }).default("Pending"),
  reimbursement: varchar("reimbursement", { length: 10 }).default("No"),
  notes: text("notes"),
  invoiceAmount: varchar("invoice_amount", { length: 50 }),
  invoiceAmountUsd: varchar("invoice_amount_usd", { length: 50 }),
  ticketReceived: varchar("ticket_received", { length: 10 }).default("No"),
  invoiceReceived: varchar("invoice_received", { length: 10 }).default("No"),
  visaReceived: varchar("visa_received", { length: 10 }).default("No"),
  passportCopyReceived: varchar("passport_copy_received", { length: 10 }).default("No"),
  voucherReceived: varchar("voucher_received", { length: 10 }).default("No"),
  // Google Drive URLs
  ticketUrl: text("ticket_url"),
  invoiceUrl: text("invoice_url"),
  visaUrl: text("visa_url"),
  passportUrl: text("passport_url"),
  voucherUrl: text("voucher_url"),
  // Drive file IDs for management
  ticketDriveId: text("ticket_drive_id"),
  invoiceDriveId: text("invoice_drive_id"),
  visaDriveId: text("visa_drive_id"),
  passportDriveId: text("passport_drive_id"),
  voucherDriveId: text("voucher_drive_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  registrationSheetId: text("registration_sheet_id"),
  registrationSheetName: text("registration_sheet_name").default("Form Responses 1"),
  travelSheetName: text("travel_sheet_name").default("Travel Desk Records"),
  driveFolderId: text("drive_folder_id"),
  gasWebAppUrl: text("gas_web_app_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Audit Log ────────────────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;
export type TravelRecord = typeof travelRecords.$inferSelect;
export type NewTravelRecord = typeof travelRecords.$inferInsert;
export type AppSettings = typeof appSettings.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
