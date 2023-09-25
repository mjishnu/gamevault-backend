import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { compareSync, hashSync } from "bcrypt";
import { FindManyOptions, Repository } from "typeorm";
import configuration from "../../configuration";
import { RegisterUserDto } from "./models/register-user.dto";
import { GamevaultUser } from "./gamevault-user.entity";
import { ImagesService } from "../images/images.service";
import { UpdateUserDto } from "./models/update-user.dto";
import { Role } from "./models/role.enum";

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(GamevaultUser)
    private userRepository: Repository<GamevaultUser>,
    @Inject(forwardRef(() => ImagesService))
    private imagesService: ImagesService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.setServerAdmin();
    } catch (error) {
      this.logger.error(error, "Error on FilesService Bootstrap");
    }
  }

  private async setServerAdmin() {
    try {
      if (!configuration.SERVER.ADMIN_USERNAME) {
        this.logger.warn(
          "No admin user has been configured. Ensure to set up one as follows: https://gamevau.lt/docs/server-docs/user-management#initial-setup",
        );
        return;
      }

      const user = await this.getUserByUsernameOrFail(
        configuration.SERVER.ADMIN_USERNAME,
      );

      const updateUserDto: UpdateUserDto = {
        role: Role.ADMIN,
        activated: true,
        password: configuration.SERVER.ADMIN_PASSWORD || undefined,
      };

      await this.update(user.id, updateUserDto, true);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(
          `The admin user wasn't configured because the user "${configuration.SERVER.ADMIN_USERNAME}" could not be found in the database. Make sure to register the user.`,
        );
      } else {
        this.logger.error(
          error,
          "An error occurred while configuring the server admin.",
        );
      }
    }
  }

  /**
   * Retrieves a user by their ID or throws an exception if the user is not
   * found.
   *
   * @async
   * @param id The ID of the user.
   * @param withDeleted Optional. Determines whether to include deleted users in
   *   the search. Default is `false`.
   * @returns A Promise that resolves to the user object matching the provided
   *   ID.
   * @throws {NotFoundException} If the user with the specified ID does not
   *   exist.
   */
  public async getUserByIdOrFail(
    id: number,
    withDeleted = false,
  ): Promise<GamevaultUser> {
    return await this.userRepository
      .findOneOrFail({
        where: { id },
        relations: ["progresses", "progresses.game"],
        withDeleted,
      })
      .catch(() => {
        throw new NotFoundException(`User with id ${id} was not found.`);
      });
  }

  /**
   * Get user by username or throw an exception if not found
   *
   * @param username - The username of the user to retrieve
   * @returns - The user object with specified username
   * @throws {NotFoundException} - If the user with specified username is not
   *   found
   */
  public async getUserByUsernameOrFail(
    username: string,
  ): Promise<GamevaultUser> {
    return await this.userRepository
      .findOneOrFail({
        where: { username },
        relations: ["progresses", "progresses.game"],
      })
      .catch(() => {
        throw new NotFoundException(
          `User with username ${username} was not found on the server.`,
        );
      });
  }

  /**
   * Get an overview of all users
   *
   * @returns - Overview of all users
   */
  public async getUsers(
    includeDeleted = false,
    includeUnactivated = false,
  ): Promise<GamevaultUser[]> {
    const query: FindManyOptions<GamevaultUser> = {
      order: { id: "ASC" },
      withDeleted: includeDeleted,
    };

    if (includeUnactivated === false) {
      query.where = { activated: true };
    }

    return await this.userRepository.find(query);
  }

  /**
   * Register a new user
   *
   * @param dto - The user data to register
   * @returns - The newly registered user object
   * @throws {ForbiddenException} - If a user with the same email or username
   *   already exists
   */
  public async register(dto: RegisterUserDto): Promise<GamevaultUser> {
    await this.checkForExistingUser(dto.username, dto.email);
    const user = new GamevaultUser();
    user.username = dto.username;
    user.password = hashSync(dto.password, 10);
    user.email = dto.email;
    user.first_name = dto.first_name;
    user.last_name = dto.last_name;

    if (
      configuration.SERVER.ACCOUNT_ACTIVATION_DISABLED ||
      user.username === configuration.SERVER.ADMIN_USERNAME
    ) {
      user.activated = true;
    }

    if (user.username === configuration.SERVER.ADMIN_USERNAME) {
      user.role = Role.ADMIN;
    }

    return await this.userRepository.save(user);
  }

  /**
   * Logs in a user with the provided username and password.
   *
   * @param username - The username of the user.
   * @param password - The password of the user.
   * @returns The logged-in user.
   * @throws {UnauthorizedException} If the login fails due to an incorrect
   *   username or password.
   * @throws {NotFoundException} If the user has been deleted.
   * @throws {ForbiddenException} If the user is not activated.
   */
  public async login(
    username: string,
    password: string,
  ): Promise<GamevaultUser> {
    const user = await this.userRepository
      .findOneOrFail({
        where: { username },
        select: ["username", "password", "activated", "role", "deleted_at"],
        withDeleted: true,
        loadEagerRelations: false,
      })
      .catch(() => {
        throw new UnauthorizedException(
          "Login Failed: Incorrect Username",
          `User ${username} not found.`,
        );
      });
    if (!compareSync(password, user.password)) {
      throw new UnauthorizedException("Login Failed: Incorrect Password");
    }
    delete user.password;
    if (user.deleted_at) {
      throw new NotFoundException("Login Failed: User has been deleted");
    }
    if (!user.activated && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        "Login Failed: User is not activated. Contact an Administrator to activate the User.",
      );
    }
    return user;
  }

  /**
   * Updates an existing user with the specified ID.
   *
   * @param id - The ID of the user to update.
   * @param dto - The DTO containing the updated user data.
   * @returns - A promise that resolves to the updated user.
   * @throws {ForbiddenException} - If a user with the same email or username
   *   already exists.
   * @throws {NotFoundException} - If no user with the specified ID exists.
   */
  public async update(
    id: number,
    dto: UpdateUserDto,
    admin = false,
    executorUsername?: string,
  ): Promise<GamevaultUser> {
    const user = await this.getUserByIdOrFail(id);

    if (dto.username != null && dto.username !== user.username) {
      await this.checkForExistingUser(dto.username, undefined);
      user.username = dto.username;
    }

    if (dto.email != null && dto.email !== user.email) {
      await this.checkForExistingUser(undefined, dto.email);
      user.email = dto.email;
    }

    if (dto.first_name != null) {
      user.first_name = dto.first_name;
    }

    if (dto.last_name != null) {
      user.last_name = dto.last_name;
    }

    if (dto.password != null) {
      user.password = hashSync(dto.password, 10);
    }

    if (dto.profile_picture_url != null) {
      user.profile_picture = await this.imagesService.downloadImageByUrl(
        dto.profile_picture_url,
        executorUsername,
      );
    }

    if (dto.profile_picture_id) {
      user.profile_picture = await this.imagesService.findByIdOrFail(
        dto.profile_picture_id,
      );
    }

    if (dto.background_image_url != null) {
      user.background_image = await this.imagesService.downloadImageByUrl(
        dto.background_image_url,
        executorUsername,
      );
    }

    if (dto.background_image_id) {
      user.background_image = await this.imagesService.findByIdOrFail(
        dto.background_image_id,
      );
    }

    if (admin && dto.activated != null) {
      user.activated = dto.activated;
    }

    if (admin && dto.role != null) {
      user.role = dto.role;
    }

    return this.userRepository.save(user);
  }

  /**
   * Soft deletes a user with the specified ID.
   *
   * @param id - The ID of the user to delete.
   */
  public async delete(id: number): Promise<GamevaultUser> {
    const user = await this.getUserByIdOrFail(id);
    return this.userRepository.softRemove(user);
  }

  /**
   * Recovers a deleted user with the specified ID.
   *
   * @param id - The ID of the user to recover.
   */
  public async recover(id: number): Promise<GamevaultUser> {
    const user = await this.getUserByIdOrFail(id, true);
    return this.userRepository.recover(user);
  }

  /**
   * Set profile picture of a user
   *
   * @deprecated
   * @param id - The ID of the user whose profile picture to set
   * @param url - The URL of the new profile picture
   * @returns - The updated user object
   * @throws {NotFoundException} - If the user with specified ID is not found
   */
  public async setProfilePicture(
    id: number,
    url: string,
  ): Promise<GamevaultUser> {
    const user = await this.getUserByIdOrFail(id);
    user.profile_picture = await this.imagesService.downloadImageByUrl(url);
    return await this.userRepository.save(user);
  }

  /**
   * Set profile art of a user
   *
   * @deprecated
   * @param id - The ID of the user whose profile art to set
   * @param url - The URL of the new profile art
   * @returns - The updated user object
   * @throws {NotFoundException} - If the user with specified ID is not found
   */
  public async setProfileArt(id: number, url: string): Promise<GamevaultUser> {
    const user = await this.getUserByIdOrFail(id);
    user.background_image = await this.imagesService.downloadImageByUrl(url);
    return await this.userRepository.save(user);
  }

  /**
   * Check if the username matches the user ID or is an administrator
   *
   * @param userId - The ID of the user to check
   * @param username - The username of the user to check
   * @returns - True if the username matches the user ID, false otherwise
   * @throws {UnauthorizedException} - If no authorization is provided or the
   *   username does not match the user ID
   * @throws {NotFoundException} - If the user with specified ID is not found
   * @throws {ForbiddenException} - If authentication is disabled or the
   *   username does not match the user ID
   */
  public async checkIfUsernameMatchesIdOrPriviledged(
    userId: number,
    username: string,
  ): Promise<boolean> {
    if (configuration.TESTING.AUTHENTICATION_DISABLED) {
      return true;
    }
    if (!username) {
      throw new UnauthorizedException("No Authorization provided");
    }
    const user = await this.getUserByIdOrFail(userId);
    if (user.role === Role.ADMIN) {
      return true;
    }
    if (user.username !== username) {
      throw new ForbiddenException(
        {
          requestedId: userId,
          requestedUser: user.username,
          requestor: username,
        },
        "You are not allowed to make changes to other users data.",
      );
    }
    return true;
  }

  /**
   * Checks for the existence of a user with the given username or email.
   *
   * @param username - The username to check.
   * @param email - The email to check.
   * @throws {ForbiddenException} If a user with the same username or email
   *   already exists.
   */
  private async checkForExistingUser(
    username: string | undefined,
    email: string | undefined,
  ) {
    if (username && email) {
      return;
    }

    const where = {} as { username: string; email: string };

    if (username) {
      where.username = username;
    }

    if (email) {
      where.email = email;
    }

    const existingUser = await this.userRepository.findOne({ where });

    if (existingUser) {
      const duplicateField =
        existingUser.username === username ? "username" : "email";
      throw new ForbiddenException(
        `User with this ${duplicateField} already exists.`,
      );
    }
  }
}