import type { Metadata } from "next";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { EnTetePage } from "@/components/ui/base";
import { ListeCourses } from "@/components/courses/liste-courses";

export const metadata: Metadata = { title: "Courses" };

export default async function PageCourses() {
  await exigerUtilisateur();
  const articles = await db.articleCourse.findMany({
    orderBy: [{ ajouteLe: "asc" }],
  });
  const restants = articles.filter((a) => !a.coche).length;

  return (
    <div className="space-y-4">
      <EnTetePage
        titre="Courses"
        sousTitre={
          restants === 0
            ? "Rien à acheter pour le moment"
            : `${restants} article${restants > 1 ? "s" : ""} à acheter`
        }
      />
      <ListeCourses articles={articles} />
    </div>
  );
}
