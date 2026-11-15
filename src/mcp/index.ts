import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {createMcpServer} from './server'

createMcpServer().connect(new StdioServerTransport()).catch(()=>{process.stderr.write('订单导出 MCP 启动失败\n');process.exitCode=1})
