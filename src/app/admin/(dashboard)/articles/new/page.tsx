import {
  ArticleEditor,
  emptyArticleForm,
} from "@/components/admin/article-editor";
import { requireEditorialPage } from "@/lib/admin-access";
import { categorySelectOptions, listCategories } from "@/lib/cms";
import {
  listContentAccessRoleOptions,
  listContentAccessUserOptions,
} from "@/lib/content-access-options";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  await requireEditorialPage();

  const [categories, userOptions, roleOptions] = await Promise.all([
    listCategories(),
    listContentAccessUserOptions(),
    listContentAccessRoleOptions(),
  ]);

  return (
    <ArticleEditor
      heading="New article"
      initial={emptyArticleForm}
      categories={categorySelectOptions(categories, "vi")}
      userOptions={userOptions}
      roleOptions={roleOptions}
    />
  );
}
