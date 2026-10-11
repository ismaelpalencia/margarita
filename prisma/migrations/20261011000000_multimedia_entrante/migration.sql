-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mediaDownloadError" TEXT,
ADD COLUMN     "mediaDownloadedAt" TIMESTAMP(3),
ADD COLUMN     "mediaFilename" TEXT,
ADD COLUMN     "mediaPath" TEXT,
ADD COLUMN     "mediaSize" INTEGER;

