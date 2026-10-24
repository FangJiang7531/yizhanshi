-- AlterTable
ALTER TABLE "Bookmark" ADD COLUMN     "postId" TEXT;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
