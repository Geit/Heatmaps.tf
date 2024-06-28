#pragma semicolon 1
#include <sourcemod>
#include <tf2>
#include <tf2_stocks>

#define PL_VERSION "0.1"

new String:g_mapName[128];
new Float:g_mapScale, Float:g_mapCenterPos[3], Float:g_mapOffset[2];
new Handle:g_heatmapDatabase;

public Plugin:myinfo =
{
	name = "Screenshot collector",
	author = "Geit",
	description = "Collects screenshots for TF2 Heatmaps",
	version = PL_VERSION,
	url = "http://geit.co.uk/portfolio/heatmaps"
}
public OnPluginStart()
{
	Database_Init();
}

public OnMapStart()
{
	decl Float:worldMin[3], Float:worldMax[3], Float:scale_x, Float:scale_y;
	
	GetEntPropVector(0, Prop_Send, "m_WorldMins", worldMin);
	GetEntPropVector(0, Prop_Send, "m_WorldMaxs", worldMax);
	scale_x = (FloatAbs(worldMin[0]) + FloatAbs(worldMax[0]))/1280.0;
	scale_y = (FloatAbs(worldMin[1]) + FloatAbs(worldMax[1]))/1024.0;
	
	if(scale_x > scale_y)
		g_mapScale = scale_x;
	else
		g_mapScale = scale_y;
	
	g_mapCenterPos[0] = ((FloatAbs(worldMin[0]) + FloatAbs(worldMax[0]))/2.0) + worldMin[0];
	g_mapCenterPos[1] = ((FloatAbs(worldMin[1]) + FloatAbs(worldMax[1]))/2.0) + worldMin[1];
	g_mapCenterPos[2] = worldMax[2] + 2000;
	
	g_mapOffset[0] = g_mapCenterPos[0] - (1280.0 * g_mapScale)/2.0;
	g_mapOffset[1] = g_mapCenterPos[1] + (1024.0 * g_mapScale)/2.0;
	
	GetCurrentMap(g_mapName, sizeof(g_mapName));
	
	CreateTimer(7.0, Timer_DoOverview);
}

public Action:Timer_DoOverview(Handle:timer, any:entity)
{
	ServerCommand("spec_mode 6");
	ServerCommand("r_skybox 0");
	ServerCommand("fog_override 1");
	ServerCommand("fog_enable 0");
	ServerCommand("r_novis 1");
	ServerCommand("r_screenoverlay null");
	ServerCommand("cl_maxrenderable_dist 30000");
	CreateTimer(2.0, Timer_OverlayDelay, 0);
	return Plugin_Handled;
}

public Action:Timer_OverlayDelay(Handle:timer, any:stage)
{
	switch(stage) 
	{
		case 0:
		{
			ServerCommand("setpos_exact %f %f %f", g_mapCenterPos[0], g_mapCenterPos[1], g_mapCenterPos[2]);
			ServerCommand("noclip");
			ServerCommand("cl_leveloverview %f", g_mapScale);
			ServerCommand("r_drawvgui 0");
			ServerCommand("cl_drawhud 0");
			CreateTimer(2.0, Timer_OverlayDelay, 1);
		}
		case 1:
		{
			ServerCommand("jpeg daemon/%s_overview", g_mapName);
			decl String:query[392], String:EscapedMap[256];
			
			SQL_EscapeString(g_heatmapDatabase, g_mapName, EscapedMap, sizeof(EscapedMap)); 
			Format(query, sizeof(query), "UPDATE maps SET overview_state = 1, offset_x = %f, offset_y=%f, scale=%f WHERE `name`='%s' AND overview_state = 0", g_mapOffset[0], g_mapOffset[1], g_mapScale, EscapedMap);
			SQL_TQuery(g_heatmapDatabase, CB_ErrorOnly, query);
			
			CreateTimer(2.0, Timer_OverlayDelay, 2);
		}
		case 2:
		{
			ServerCommand("cl_leveloverview 0");
			ServerCommand("r_drawvgui 1");
			ServerCommand("cl_drawhud 1");
			CreateTimer(0.0, Timer_DoSwitchMap);
		}
	}
	return Plugin_Handled;
}

public Action:Timer_DoSwitchMap(Handle:timer, any:entity)
{
	decl String:query[392];
	Format(query, sizeof(query), "SELECT `name` FROM maps WHERE overview_state=0 ORDER BY RAND() LIMIT 1");
	SQL_TQuery(g_heatmapDatabase, CB_GoToNextMap, query);
	return Plugin_Handled;
}

public Database_Init()
{	
	decl String:error[255];
	if (g_heatmapDatabase == INVALID_HANDLE) {
		new Handle:kv = CreateKeyValues("");	
		KvSetString(kv, "driver", "mysql");
		KvSetString(kv, "database", "heatmaps");
		KvSetString(kv, "host", "<HOST>");
		KvSetString(kv, "user", "<USER>");
		KvSetString(kv, "pass", "<PASSWORD>");
		KvSetString(kv, "timeout", "6");	
		g_heatmapDatabase = SQL_ConnectCustom(kv, error, sizeof(error), true);
		CloseHandle(kv);

		if(g_heatmapDatabase != INVALID_HANDLE)
		{
			SQL_FastQuery(g_heatmapDatabase, "SET NAMES UTF8");  
			PrintToServer("[SS-Daemon] Connected successfully.");
			return true;
		} 
		else 
		{
			PrintToServer("[SS-Daemon] Connection Failed to heatmaps: %s", error);
			LogError("[SS-Daemon] Connection Failed to heatmaps: %s", error);
			return false;
		}
	}
	return true;
}

public CB_GoToNextMap(Handle:owner, Handle:result, const String:error[], any:derp) 
{
	if(result != INVALID_HANDLE && SQL_HasResultSet(result) && SQL_GetRowCount(result) == 1)
	{
		decl String:NextMap[64], String:buffer[128];
		SQL_FetchRow(result);
		SQL_FetchString(result, 0, NextMap, sizeof(NextMap));
		Format(buffer, sizeof(buffer), "maps/%s.bsp", NextMap);
		if(FileExists(buffer, false))
		{
			ServerCommand("changelevel %s", NextMap);
			Format(query, sizeof(query), "UPDATE maps SET overview_state = -1 WHERE `name`='%s' AND overview_state = 0", NextMap);
			SQL_TQuery(g_heatmapDatabase, CB_ErrorOnly, query);
		}
		else
		{
			CreateTimer(0.0, Timer_DoSwitchMap);
		}
	}
	else if(result == INVALID_HANDLE)
	{
		LogError("[SS-Daemon] MYSQL ERROR ( error: %s)", error);
		PrintToChatAll("[SS-Daemon] MYSQL ERROR (error: %s)", error);
	}
}

public CB_ErrorOnly(Handle:owner, Handle:result, const String:error[], any:client)
{
	if(result == INVALID_HANDLE)
	{
		LogError("[SS-Daemon] MYSQL ERROR (error: %s)", error);
		PrintToChatAll("[SS-Daemon]MYSQL ERROR (error: %s)", error);
	}
}
