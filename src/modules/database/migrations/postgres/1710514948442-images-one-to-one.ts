import { MigrationInterface, QueryRunner } from "typeorm";

export class ImagesOneToOne1710514948442 implements MigrationInterface {
  name = "ImagesOneToOne1710514948442";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Set non-unique background_image_id in the game table to NULL
    await queryRunner.query(`
    UPDATE "game"
    SET "background_image_id" = NULL
    WHERE "background_image_id" IN (
        SELECT "background_image_id"
        FROM "game"
        GROUP BY "background_image_id"
        HAVING COUNT(*) > 1
    );
    `);

    // Set non-unique box_image_id in the game table to NULL
    await queryRunner.query(`
    UPDATE "game"
    SET "box_image_id" = NULL
    WHERE "box_image_id" IN (
        SELECT "box_image_id"
        FROM "game"
        GROUP BY "box_image_id"
        HAVING COUNT(*) > 1
    );
    `);

    // Set non-unique profile_picture_id in the gamevault_user table to NULL
    await queryRunner.query(`
    UPDATE "gamevault_user"
    SET "profile_picture_id" = NULL
    WHERE "profile_picture_id" IN (
        SELECT "profile_picture_id"
        FROM "gamevault_user"
        GROUP BY "profile_picture_id"
        HAVING COUNT(*) > 1
    );
    `);

    // Set non-unique background_image_id in the gamevault_user table to NULL
    await queryRunner.query(`
    UPDATE "gamevault_user"
    SET "background_image_id" = NULL
    WHERE "background_image_id" IN (
        SELECT "background_image_id"
        FROM "gamevault_user"
        GROUP BY "background_image_id"
        HAVING COUNT(*) > 1
    );
    `);

    await queryRunner.query(`
            ALTER TABLE "game" DROP CONSTRAINT "FK_52b4bb990c5a5fe76c6d675c002"
        `);
    await queryRunner.query(`
            ALTER TABLE "game" DROP CONSTRAINT "FK_0e88ada3f37f7cabfb6d59ed0d0"
        `);
    await queryRunner.query(`
            ALTER TABLE "game"
            ADD CONSTRAINT "UQ_52b4bb990c5a5fe76c6d675c002" UNIQUE ("box_image_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "game"
            ADD CONSTRAINT "UQ_0e88ada3f37f7cabfb6d59ed0d0" UNIQUE ("background_image_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user" DROP CONSTRAINT "FK_c1779b9b22212754248aa404bad"
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user" DROP CONSTRAINT "FK_4b83e27ed50c1e183a69fceef68"
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user"
            ADD CONSTRAINT "UQ_c1779b9b22212754248aa404bad" UNIQUE ("profile_picture_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user"
            ADD CONSTRAINT "UQ_4b83e27ed50c1e183a69fceef68" UNIQUE ("background_image_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "game"
            ADD CONSTRAINT "FK_52b4bb990c5a5fe76c6d675c002" FOREIGN KEY ("box_image_id") REFERENCES "image"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "game"
            ADD CONSTRAINT "FK_0e88ada3f37f7cabfb6d59ed0d0" FOREIGN KEY ("background_image_id") REFERENCES "image"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user"
            ADD CONSTRAINT "FK_c1779b9b22212754248aa404bad" FOREIGN KEY ("profile_picture_id") REFERENCES "image"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user"
            ADD CONSTRAINT "FK_4b83e27ed50c1e183a69fceef68" FOREIGN KEY ("background_image_id") REFERENCES "image"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "gamevault_user" DROP CONSTRAINT "FK_4b83e27ed50c1e183a69fceef68"
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user" DROP CONSTRAINT "FK_c1779b9b22212754248aa404bad"
        `);
    await queryRunner.query(`
            ALTER TABLE "game" DROP CONSTRAINT "FK_0e88ada3f37f7cabfb6d59ed0d0"
        `);
    await queryRunner.query(`
            ALTER TABLE "game" DROP CONSTRAINT "FK_52b4bb990c5a5fe76c6d675c002"
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user" DROP CONSTRAINT "UQ_4b83e27ed50c1e183a69fceef68"
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user" DROP CONSTRAINT "UQ_c1779b9b22212754248aa404bad"
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user"
            ADD CONSTRAINT "FK_4b83e27ed50c1e183a69fceef68" FOREIGN KEY ("background_image_id") REFERENCES "image"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "gamevault_user"
            ADD CONSTRAINT "FK_c1779b9b22212754248aa404bad" FOREIGN KEY ("profile_picture_id") REFERENCES "image"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "game" DROP CONSTRAINT "UQ_0e88ada3f37f7cabfb6d59ed0d0"
        `);
    await queryRunner.query(`
            ALTER TABLE "game" DROP CONSTRAINT "UQ_52b4bb990c5a5fe76c6d675c002"
        `);
    await queryRunner.query(`
            ALTER TABLE "game"
            ADD CONSTRAINT "FK_0e88ada3f37f7cabfb6d59ed0d0" FOREIGN KEY ("background_image_id") REFERENCES "image"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "game"
            ADD CONSTRAINT "FK_52b4bb990c5a5fe76c6d675c002" FOREIGN KEY ("box_image_id") REFERENCES "image"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }
}
