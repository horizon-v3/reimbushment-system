import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  date,
  time,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").default("staff").notNull(),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Registrations ────────────────────────────────────────────────────────────
// Columns mirror the Google Form exactly:
// Timestamp | Sr No | Title | First Name | Last Name | Country Name
// Passport Country | Region | Participant Mobile | Participant Email
// Company Name | Company Website | Designation | Passport Number
// Place of Issue | Date of Expiry | Passport Front Copy | Passport Back Copy
// Nature of Business | Main Import Product 1 | Main Import Product 2
// Upload proof of Import | Products/Services | Business Card Upload
// POC | Proof of Import | Type of POI | B/L Supplier Country | B/L Buyer Country
// Status | Flight & Hotel | Remarks | B/L Status | BB Invitation letter status
export const registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),
  srNo: integer("sr_no").unique(),
  timestampRaw: text("timestamp_raw"),
  title: text("title"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  countryName: text("country_name"),
  passportCountry: text("passport_country"),
  region: text("region"),
  participantMobile: text("participant_mobile"),
  participantEmail: text("participant_email"),
  companyName: text("company_name"),
  companyWebsite: text("company_website"),
  designation: text("designation"),
  passportNumber: text("passport_number"),
  placeOfIssue: text("place_of_issue"),
  dateOfExpiry: text("date_of_expiry"),
  passportFrontCopy: text("passport_front_copy"),        // Google Form file URL
  passportBackCopy: text("passport_back_copy"),          // Google Form file URL
  natureOfBusiness: text("nature_of_business"),
  mainImportProduct1: text("main_import_product_1"),
  mainImportProduct2: text("main_import_product_2"),
  proofUpload: text("proof_upload"),                     // B/L or other proof file URL
  productsServices: text("products_services"),
  businessCardUpload: text("business_card_upload"),      // Business card file URL
  poc: text("poc"),
  proofImport: text("proof_import"),
  typeOfPoi: text("type_of_poi"),
  blSupplierCountry: text("bl_supplier_country"),
  blBuyerCountry: text("bl_buyer_country"),
  status: text("status"),
  flightHotelCode: text("flight_hotel_code"),
  remarks: text("remarks"),
  blStatus: text("bl_status"),
  bbInvitationStatus: text("bb_invitation_status"),
  dollarBusiness: text("dollar_business"),   // GAS: "dollar business" column
  vujis: text("vujis"),                      // GAS: "vujis" column
  willNotAttend: text("will_not_attend"),    // blank = attend, any value = will not attend
  isActive: boolean("is_active").default(true),
  // Google Drive mirrored URLs (set by GAS after upload)
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
  responsesSrNo: text("responses_sr_no"),
  roomNo: text("room_no"),
  hotelName: text("hotel_name"),
  initial: text("initial"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  countryName: text("country_name"),
  countryCode: text("country_code"),
  participantMobile: text("participant_mobile"),
  checkInDate: date("check_in_date"),
  checkOutDate: date("check_out_date"),
  roomUnits: numeric("room_units", { precision: 4, scale: 2 }),
  arrivalDate: date("arrival_date"),
  arrivalFlightNo: text("arrival_flight_no"),
  arrivalTo: text("arrival_to"),
  arrivalTime: time("arrival_time"),
  departureDate: date("departure_date"),
  departureFlightNo: text("departure_flight_no"),
  departureFrom: text("departure_from"),
  departureTime: time("departure_time"),
  sector: text("sector"),
  companyName: text("company_name"),
  poc: text("poc"),
  status: text("status").default("Pending"),
  reimbursement: text("reimbursement").default("No"),
  notes: text("notes"),
  invoiceAmount: text("invoice_amount"),
  invoiceAmountUsd: text("invoice_amount_usd"),
  invoiceAmountLocal: text("invoice_amount_local"),
  invoiceCurrency: text("invoice_currency"),
  ticketReceived: text("ticket_received").default("No"),
  invoiceReceived: text("invoice_received").default("No"),
  visaReceived: text("visa_received").default("No"),
  passportCopyReceived: text("passport_copy_received").default("No"),
  voucherReceived: text("voucher_received").default("No"),
  reimbursementAmount: text("reimbursement_amount"),
  bl: text("bl"),
  blUrl: text("bl_url"),
  // Google Drive URLs
  ticketUrl: text("ticket_url"),
  invoiceUrl: text("invoice_url"),
  visaUrl: text("visa_url"),
  passportUrl: text("passport_url"),
  voucherUrl: text("voucher_url"),
  businessCardUrl: text("business_card_url"),
  // Drive file IDs for management
  ticketDriveId: text("ticket_drive_id"),
  invoiceDriveId: text("invoice_drive_id"),
  visaDriveId: text("visa_drive_id"),
  passportDriveId: text("passport_drive_id"),
  voucherDriveId: text("voucher_drive_id"),
  businessCardDriveId: text("business_card_drive_id"),
  blDriveId: text("bl_drive_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── DB & Vujis Records ───────────────────────────────────────────────────────
export const dbVujisRecords = pgTable("db_vujis_records", {
  id: serial("id").primaryKey(),
  srNo: integer("sr_no").unique(),
  companyName: text("company_name"),
  countryName: text("country_name"),
  region: text("region"),
  proofOfImportY: text("proof_of_import_y"),
  proofOfImportN: text("proof_of_import_n"),
  vujis: text("vujis"),
  importValueVujis: text("import_value_vujis"),
  dollarBusiness: text("dollar_business"),
  importValueDollar: text("import_value_dollar"),
  bothDbVujis: text("both_db_vujis"),
  importingFromIndia: text("importing_from_india"),
  importingFromOtherCountry: text("importing_from_other_country"),
  mainImportProduct1: text("main_import_product_1"),
  mainImportProduct2: text("main_import_product_2"),
  poc: text("poc"),
  reason: text("reason"),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  registrationSheetId: text("registration_sheet_id"),
  registrationSheetName: text("registration_sheet_name").default("Form Responses 1"),
  travelSheetName: text("travel_sheet_name").default("Travel Desk Records"),
  dbVujisSheetName: text("db_vujis_sheet_name").default("DB & vujis"),
  driveFolderId: text("drive_folder_id"),
  gasWebAppUrl: text("gas_web_app_url"),
  // ── Session security ───────────────────────────────────────────────────────
  sessionTimeoutMinutes: integer("session_timeout_minutes").default(30),
  // ── Backup destination (secondary GAS / different Google account) ──────────
  backupGasWebAppUrl: text("backup_gas_web_app_url"),   // GAS Web App URL of backup script
  backupSheetId: text("backup_sheet_id"),               // Backup spreadsheet ID
  backupFolderId: text("backup_folder_id"),             // Backup Drive folder ID
  backupSheetId2: text("backup_sheet_id_2"),            // Optional second backup spreadsheet
  backupFolderId2: text("backup_folder_id_2"),          // Optional second backup Drive folder
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Audit Log ────────────────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userName: text("user_name"),
  userRole: text("user_role"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  status: text("status").default("success"),  // success | failed | blocked | pending
  ipAddress: text("ip_address"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Operation Permissions ────────────────────────────────────────────────────
// Supervisor overwrite requests must be approved by admin (type "confirm")
export const operationPermissions = pgTable("operation_permissions", {
  id: serial("id").primaryKey(),
  requestedBy: integer("requested_by"),       // supervisor's user id
  requestedByName: text("requested_by_name"),
  operation: text("operation").notNull(),      // e.g. "overwrite_registration"
  description: text("description"),
  status: text("status").default("pending"),   // pending | approved | denied | revoked
  approvedBy: integer("approved_by"),          // admin who approved
  approvedByName: text("approved_by_name"),
  confirmedAt: timestamp("confirmed_at"),
  expiresAt: timestamp("expires_at"),          // optional TTL
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Chat Messages ────────────────────────────────────────────────────────────
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  isEdited: boolean("is_edited").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;
export type TravelRecord = typeof travelRecords.$inferSelect;
export type NewTravelRecord = typeof travelRecords.$inferInsert;
export type DbVujisRecord = typeof dbVujisRecords.$inferSelect;
export type NewDbVujisRecord = typeof dbVujisRecords.$inferInsert;
export type AppSettings = typeof appSettings.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

// Trigger HMR
