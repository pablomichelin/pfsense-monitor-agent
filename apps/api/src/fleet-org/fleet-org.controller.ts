import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import {
  CreateGroupDto,
  ListGroupsQueryDto,
  SetGroupMembersDto,
  UpdateGroupDto,
} from './dto/groups.dto';
import { CreateTagDto, ListTagsQueryDto, UpdateTagDto } from './dto/tags.dto';
import { GroupsService } from './groups.service';
import { TagsService } from './tags.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @RequirePermissions('tags.view')
  listTags(
    @Query() query: ListTagsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.tagsService.listTags(getAccessActor(request), query);
  }

  @Post()
  @RequirePermissions('tags.manage')
  createTag(
    @Body() body: CreateTagDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.tagsService.createTag(
      getAccessActor(request),
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Patch(':id')
  @RequirePermissions('tags.manage')
  updateTag(
    @Param('id') id: string,
    @Body() body: UpdateTagDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.tagsService.updateTag(
      getAccessActor(request),
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Delete(':id')
  @RequirePermissions('tags.manage')
  deleteTag(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.tagsService.deleteTag(
      getAccessActor(request),
      id,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }
}

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @RequirePermissions('groups.view')
  listGroups(
    @Query() query: ListGroupsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.groupsService.listGroups(getAccessActor(request), query);
  }

  @Get(':id')
  @RequirePermissions('groups.view')
  getGroupById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.groupsService.getGroupById(getAccessActor(request), id);
  }

  @Post()
  @RequirePermissions('groups.manage')
  createGroup(
    @Body() body: CreateGroupDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.groupsService.createGroup(
      getAccessActor(request),
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Patch(':id')
  @RequirePermissions('groups.manage')
  updateGroup(
    @Param('id') id: string,
    @Body() body: UpdateGroupDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.groupsService.updateGroup(
      getAccessActor(request),
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Delete(':id')
  @RequirePermissions('groups.manage')
  deleteGroup(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.deleteGroup(
      getAccessActor(request),
      id,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Put(':id/members')
  @RequirePermissions('groups.manage')
  setGroupMembers(
    @Param('id') id: string,
    @Body() body: SetGroupMembersDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.groupsService.setGroupMembers(
      getAccessActor(request),
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }
}
