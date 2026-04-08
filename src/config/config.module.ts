import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { EnvSchema } from './validation/env.schema';
import { ConfigService } from './config.service';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: config => {
        const result = EnvSchema.safeParse(config);
        if (!result.success) {
          const lines = result.error.issues.map(
            issue => `  ${issue.path.join('.')}: ${issue.message}`
          );
          console.error(
            '\nConfiguration error: invalid or missing environment variables\n\n' +
              lines.join('\n') +
              '\n\nCopy .env.example to .env and fill in the required values.\n'
          );
          process.exit(1);
        }
        return result.data;
      },
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
