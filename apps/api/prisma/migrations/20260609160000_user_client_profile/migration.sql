-- AlterEnum (deve rodar isolado antes de usar o valor em inserts)
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'client';
