import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Column, Entity, Index, ManyToMany } from "typeorm";

import { DatabaseEntity } from "../database/database.entity";
import { Game } from "../games/game.entity";

@Entity()
export class Publisher extends DatabaseEntity {
  @Index()
  @Column({ nullable: true })
  @ApiPropertyOptional({
    example: 1000,
    description: "unique rawg-api-identifier of the publisher",
  })
  rawg_id?: number;

  @Index()
  @Column({ unique: true })
  @ApiProperty({
    example: "Rockstar Games",
    description: "name of the publisher",
  })
  name: string;

  @ManyToMany(() => Game, (game) => game.publishers)
  @ApiProperty({
    description: "games published by the publisher",
    type: () => Game,
    isArray: true,
  })
  games: Game[];
}
