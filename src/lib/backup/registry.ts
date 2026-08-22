import { ApiToken } from "@/models/ApiToken";
import { AppRole } from "@/models/AppRole";
import { Article } from "@/models/Article";
import { Callsign } from "@/models/Callsign";
import { CallsignImport } from "@/models/CallsignImport";
import { CallsignLicense } from "@/models/CallsignLicense";
import { CallsignOperator } from "@/models/CallsignOperator";
import { Category } from "@/models/Category";
import { FormDefinition } from "@/models/FormDefinition";
import { FormSubmission } from "@/models/FormSubmission";
import { MailMessage } from "@/models/MailMessage";
import { Media } from "@/models/Media";
import { MenuItem } from "@/models/MenuItem";
import { Page } from "@/models/Page";
import { PageTemplate } from "@/models/PageTemplate";
import { QsoLog } from "@/models/QsoLog";
import { SiteSettings } from "@/models/SiteSettings";
import { User } from "@/models/User";
import { UserDocumentModel } from "@/models/UserDocument";

type BackupCollectionEntry = {
  key: string;
  collection: {
    collectionName: string;
    find(filter: Record<string, unknown>): AsyncIterable<Record<string, unknown>>;
    deleteMany(filter: Record<string, unknown>): Promise<unknown>;
    insertMany(
      docs: Record<string, unknown>[],
      options?: { ordered?: boolean },
    ): Promise<unknown>;
  };
};

export const BACKUP_COLLECTIONS: BackupCollectionEntry[] = [
  {
    key: "articles",
    collection: Article.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "categories",
    collection: Category.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "pages",
    collection: Page.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "pageTemplates",
    collection:
      PageTemplate.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "menuItems",
    collection: MenuItem.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "siteSettings",
    collection:
      SiteSettings.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "formDefinitions",
    collection:
      FormDefinition.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "formSubmissions",
    collection:
      FormSubmission.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "mailMessages",
    collection:
      MailMessage.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "media",
    collection: Media.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "users",
    collection: User.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "qsoLogs",
    collection: QsoLog.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "apiTokens",
    collection: ApiToken.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "userDocuments",
    collection:
      UserDocumentModel.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "appRoles",
    collection: AppRole.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "callsigns",
    collection: Callsign.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "callsignOperators",
    collection:
      CallsignOperator.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "callsignLicenses",
    collection:
      CallsignLicense.collection as unknown as BackupCollectionEntry["collection"],
  },
  {
    key: "callsignImports",
    collection:
      CallsignImport.collection as unknown as BackupCollectionEntry["collection"],
  },
];

export const BACKUP_COLLECTION_NAMES = BACKUP_COLLECTIONS.map(
  (entry) => entry.collection.collectionName,
);

export function getBackupCollectionByName(name: string) {
  return BACKUP_COLLECTIONS.find(
    (entry) => entry.collection.collectionName === name,
  );
}
