#pragma semicolon 1
#include <sourcemod>
#include <sdktools>
#include <tf2>
#include <tf2_stocks>
#include <sdkhooks>

#define PL_VERSION "1.1"

new Handle:g_Database;

new Handle:g_transactionHandle;
new g_MapID = -1;

public Plugin:myinfo =
{
	name = "Heatmaps",
	author = "Geit",
	description = "Logs statistics for Heatmaps",
	version = PL_VERSION,
	url = "http://geit.co.uk/portfolio/heatmaps"
}
public OnPluginStart()
{
	HookEvent("player_death", Event_PlayerDeath);
	HookEvent("teamplay_round_start", Event_RoundStart);
	Database_Init();
	
}

public OnPluginEnd()
{
	if(DatabaseIntact() && g_transactionHandle != INVALID_HANDLE)
	{
		SQL_ExecuteTransaction(g_Database, g_transactionHandle);
		g_transactionHandle = INVALID_HANDLE;
	}
}

public OnMapEnd()
{
	if(DatabaseIntact() && g_transactionHandle != INVALID_HANDLE)
	{
		SQL_ExecuteTransaction(g_Database, g_transactionHandle);
		g_transactionHandle = INVALID_HANDLE;
	}
}

public OnMapStart()
{
	g_MapID = -1;
	if(DatabaseIntact())
	{
		decl String:query[512], String:name[64], String:namebuffer[256], String:game[32], String:gamebuffer[96];
		GetCurrentMap(name, sizeof(name));
		GetGameFolderName(game, sizeof(game));
		
		SQL_EscapeString(g_Database, name, namebuffer, sizeof(namebuffer));
		SQL_EscapeString(g_Database, game, gamebuffer, sizeof(gamebuffer));
		
		Format(query, sizeof(query), "INSERT INTO `maps` (`name`, `game`, `last_seen`) VALUES ('%s', '%s', UNIX_TIMESTAMP()) ON DUPLICATE KEY UPDATE `last_seen`=UNIX_TIMESTAMP(), id=LAST_INSERT_ID(`id`)", namebuffer, gamebuffer);
		SQL_TQuery(g_Database, CB_MapInsert, query);
	}
	g_transactionHandle = SQL_CreateTransaction();
}

public Event_RoundStart(Handle:event, const String:name[], bool:dontBroadcast)
{
	if(DatabaseIntact() && g_transactionHandle != INVALID_HANDLE)
	{
		SQL_ExecuteTransaction(g_Database, g_transactionHandle);
		g_transactionHandle = SQL_CreateTransaction();
	}
}

public Event_PlayerDeath(Handle:event, const String:name[], bool:dontBroadcast)
{
	if(g_MapID == -1 || g_transactionHandle == INVALID_HANDLE) return;
	
	new victim = GetClientOfUserId(GetEventInt(event, "userid"));
	new killer = GetClientOfUserId(GetEventInt(event, "attacker"));
	
	if(victim == killer || !IsClientInGame(victim)) return; // Ignore suicides or disconnects
	decl String:query[256], String:eventWeapon[64];
	new Float:posVictim[3], Float:posKiller[3], classKiller, killerWeaponID = 0, killerTeam;
	
	// if the attacker is the world, we can't get its position
	if(killer > 0)
	{
		classKiller = _:TF2_GetPlayerClass(killer);
		GetClientAbsOrigin(killer, posKiller);
		killerTeam = GetClientTeam(killer);
	}
	GetClientAbsOrigin(victim, posVictim);
	
	GetEventString(event, "weapon_logclassname", eventWeapon, sizeof(eventWeapon));
	if(StrEqual(eventWeapon, "bleed_kill"))
	{
		killerWeaponID = -3;
	}
	
	
	new inflictor = GetEventInt(event, "inflictor_entindex");
	if(killer > 0 && inflictor > 0)
	{
		if(inflictor != killer)
		{
			decl String:classname[64];
			GetEntityClassname(inflictor, classname, sizeof(classname));
			if(StrContains(classname, "obj_") != -1)
			{
				if(GetEntProp(inflictor, Prop_Send, "m_bMiniBuilding"))
					killerWeaponID = -2;
				else
					killerWeaponID = -1;
					
				GetEntPropVector(inflictor, Prop_Send, "m_vecOrigin", posKiller);
			}
			else
			{
				if(StrContains(classname, "tf_weapon") == 0)
				{
					killerWeaponID = GetEntProp(inflictor, Prop_Send, "m_iItemDefinitionIndex");
				}
				else if(StrEqual(classname, "tf_projectile_pipe_remote") || StrEqual(classname, "tf_projectile_flare"))
				{
					killerWeaponID = GetEntProp(GetPlayerWeaponSlot(killer, 1), Prop_Send, "m_iItemDefinitionIndex");
				}
				else if (StrEqual(classname, "tf_projectile_sentryrocket"))
				{
					killerWeaponID = -1;
				}
				else
				{
					new weaponEnt = GetPlayerWeaponSlot(killer, 0);
					if(weaponEnt > 0)
						killerWeaponID = GetEntProp(weaponEnt, Prop_Send, "m_iItemDefinitionIndex");
				}
			}
		}
		else
		{
			new weaponEnt = GetEntPropEnt(killer, Prop_Send, "m_hActiveWeapon");
			if(weaponEnt > 0)
				killerWeaponID =  GetEntProp(weaponEnt, Prop_Send, "m_iItemDefinitionIndex");
		}
	}
	
	// map_id, timestamp, killer class, killer weapon, killer x, y and z, victim class, victim x, y and z, customkill, damage bits, death flags, team
	FormatEx(query, sizeof(query), "INSERT IGNORE INTO kills VALUES (DEFAULT, %i, %i, %i, %i, %f, %f, %f, %i, %f, %f, %f, %i, %i, %i, %i, DEFAULT)", 
	g_MapID, GetTime(), classKiller, killerWeaponID, posKiller[0], posKiller[1], posKiller[2], _:TF2_GetPlayerClass(victim), posVictim[0], posVictim[1], posVictim[2], GetEventInt(event, "customkill"), GetEventInt(event, "damagebits"), GetEventInt(event, "death_flags"), killerTeam);
	SQL_AddQuery(g_transactionHandle, query);
}

public CB_MapInsert(Handle:owner, Handle:result, const String:error[], any:userid)
{
	if(result != INVALID_HANDLE)
	{
		g_MapID = SQL_GetInsertId(result);
	}
}

public DatabaseIntact()
{
	if(g_Database != INVALID_HANDLE)
	{
		return true;
	}
	else 
	{
		Database_Init();
		return false;
	}
}

stock Database_Init()
{
	decl String:error[255];
	new Handle:kv = CreateKeyValues("");	
	KvSetString(kv, "driver", "mysql");
	KvSetString(kv, "database", "heatmaps");
	KvSetString(kv, "host", "<HOST>");
	KvSetString(kv, "user", "<USER>");
	KvSetString(kv, "pass", "<PASSWORD>");
	KvSetString(kv, "timeout", "1");	
	g_Database = SQL_ConnectCustom(kv, error, sizeof(error), true);
	CloseHandle(kv);

	if(g_Database != INVALID_HANDLE)
	{
		SQL_FastQuery(g_Database, "SET NAMES UTF8");  
		PrintToServer("[Heatmaps] Connected successfully.");
	} 
	else 
	{
		PrintToServer("[Heatmaps] Connection Failed: %s", error);
		return;
	}
}
