import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { StorageService } from './storage.service';

describe('StorageService private compliance files', () => {
  it('moves a local upload out of the public folder and serves only a valid temporary link', async () => {
    const originalCwd = process.cwd();
    const originalProvider = process.env.STORAGE_PROVIDER;
    const originalApiUrl = process.env.API_PUBLIC_URL;
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'duka-private-media-'));
    try {
      process.chdir(tempRoot);
      process.env.STORAGE_PROVIDER = 'local';
      process.env.API_PUBLIC_URL = 'https://api.example.test';
      await mkdir(path.join(tempRoot, 'uploads'), { recursive: true });
      await writeFile(path.join(tempRoot, 'uploads', 'identity.pdf'), Buffer.from('private document'));

      const storage = new StorageService();
      const privateUrl = await storage.moveToPrivate('/uploads/identity.pdf');
      expect(privateUrl).toMatch(/^private:\/\/private\/kyc\//);
      await expect(readFile(path.join(tempRoot, 'uploads', 'identity.pdf'))).rejects.toMatchObject({ code: 'ENOENT' });

      const temporaryUrl = await storage.createTemporaryReadUrl(privateUrl, 'application/pdf');
      expect(temporaryUrl).toContain('https://api.example.test/api/v1/media/private/');
      const token = temporaryUrl.split('/').pop()!;
      const file = await storage.readTemporaryFile(token);
      expect(file).toEqual({ body: Buffer.from('private document'), contentType: 'application/pdf' });
      await expect(storage.readTemporaryFile(`${token}x`)).rejects.toThrow('Invalid or expired document link');
    } finally {
      process.chdir(originalCwd);
      if (originalProvider === undefined) delete process.env.STORAGE_PROVIDER;
      else process.env.STORAGE_PROVIDER = originalProvider;
      if (originalApiUrl === undefined) delete process.env.API_PUBLIC_URL;
      else process.env.API_PUBLIC_URL = originalApiUrl;
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
