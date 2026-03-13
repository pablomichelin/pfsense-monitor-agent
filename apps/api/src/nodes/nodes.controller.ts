import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ListNodesQueryDto } from './dto/list-nodes-query.dto';
import { NodesService } from './nodes.service';

@UseGuards(SessionAuthGuard)
@Controller('api/v1/nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get('filters')
  getFilters() {
    return this.nodesService.getFilters();
  }

  @Get()
  listNodes(@Query() query: ListNodesQueryDto) {
    return this.nodesService.listNodes(query);
  }

  @Get(':id')
  getNodeById(@Param('id') id: string) {
    return this.nodesService.getNodeById(id);
  }
}
