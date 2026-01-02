#!/usr/bin/env node
/**
 * Wiki Encryption Migration Script
 *
 * Encrypts all existing wiki document titles and content that are not yet encrypted.
 * Also encrypts wiki revision titles and content.
 *
 * This script is safe to run multiple times - it only encrypts unencrypted content.
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/encrypt-wiki-documents.js
 *
 * Or with .env file:
 *   node scripts/encrypt-wiki-documents.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const encryptionService = require('../services/encryption.service');

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔐 Wiki Encryption Migration\n');
  console.log('This script will encrypt all unencrypted wiki documents and revisions.\n');

  // Verify encryption key is available
  if (!process.env.MESSAGE_ENCRYPTION_KEY) {
    console.error('❌ MESSAGE_ENCRYPTION_KEY environment variable is not set.');
    console.log('   Make sure you have the encryption key configured.\n');
    process.exit(1);
  }

  try {
    // Get all wiki documents
    const documents = await prisma.wikiDocument.findMany({
      select: {
        documentId: true,
        title: true,
        content: true,
      },
    });

    console.log(`📄 Found ${documents.length} wiki documents to check.\n`);

    let documentsEncrypted = 0;
    let documentsSkipped = 0;

    for (const doc of documents) {
      const titleEncrypted = encryptionService.isEncrypted(doc.title);
      const contentEncrypted = encryptionService.isEncrypted(doc.content);

      if (titleEncrypted && contentEncrypted) {
        documentsSkipped++;
        continue;
      }

      const updateData = {};

      if (!titleEncrypted && doc.title) {
        updateData.title = encryptionService.encrypt(doc.title);
      }

      if (!contentEncrypted && doc.content) {
        updateData.content = encryptionService.encrypt(doc.content);
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.wikiDocument.update({
          where: { documentId: doc.documentId },
          data: updateData,
        });
        documentsEncrypted++;
        console.log(`  ✅ Encrypted document: ${doc.documentId}`);
      }
    }

    console.log(`\n📄 Documents: ${documentsEncrypted} encrypted, ${documentsSkipped} already encrypted.\n`);

    // Get all wiki revisions
    const revisions = await prisma.wikiRevision.findMany({
      select: {
        revisionId: true,
        title: true,
        content: true,
      },
    });

    console.log(`📝 Found ${revisions.length} wiki revisions to check.\n`);

    let revisionsEncrypted = 0;
    let revisionsSkipped = 0;

    for (const rev of revisions) {
      const titleEncrypted = encryptionService.isEncrypted(rev.title);
      const contentEncrypted = encryptionService.isEncrypted(rev.content);

      if (titleEncrypted && contentEncrypted) {
        revisionsSkipped++;
        continue;
      }

      const updateData = {};

      if (!titleEncrypted && rev.title) {
        updateData.title = encryptionService.encrypt(rev.title);
      }

      if (!contentEncrypted && rev.content) {
        updateData.content = encryptionService.encrypt(rev.content);
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.wikiRevision.update({
          where: { revisionId: rev.revisionId },
          data: updateData,
        });
        revisionsEncrypted++;
        console.log(`  ✅ Encrypted revision: ${rev.revisionId}`);
      }
    }

    console.log(`\n📝 Revisions: ${revisionsEncrypted} encrypted, ${revisionsSkipped} already encrypted.\n`);

    console.log('✅ Wiki encryption migration complete!\n');
  } catch (error) {
    console.error('❌ Error during migration:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
