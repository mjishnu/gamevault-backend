import { BasicStrategy } from "passport-http";
import { Injectable, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { UsersService } from "../services/users.service";
import { CrackpipeUser } from "../database/entities/crackpipe-user.entity";

@Injectable()
export class DefaultStrategy extends PassportStrategy(BasicStrategy) {
  private readonly logger = new Logger(DefaultStrategy.name);
  constructor(private usersService: UsersService) {
    super({
      passReqToCallback: true,
    });
  }

  /**
   * Validates a username and password.
   *
   * @async
   * @param req - The request object.
   * @param req.user.username - The username to validate.
   * @param username - The username to validate.
   * @param password - The password to validate.
   * @returns - Whether or not the login worked
   */
  async validate(
    req: { crackpipeuser: CrackpipeUser },
    username: string,
    password: string,
  ) {
    const user = await this.usersService.login(username, password);
    req.crackpipeuser = user;
    return user ? true : false;
  }
}