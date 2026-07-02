-- Link de acesso remoto ao pfSense (ex.: https://177.38.158.46:9999)
ALTER TABLE "nodes" ADD COLUMN "remote_access_url" TEXT;
