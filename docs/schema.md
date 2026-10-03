**user signup and login**

user needs to create account using:
    name,
    email,
    password
use middeleware, for authentiction signup/signin express endpoints, use jwt for creating auth middleware
for pass bcrypt



**DATABASE**

Tables:
    USERS
    LOGS contains what has broken with time 
    LOG_reports from when to when the downtime was
    MONITORS HAS ROWS (URLS) AS THE USER WEBSITE TO MONITOR WITH SELECTION:
        every 1 min,
        every 1 hour,
        every 1 day


user will daily check their website status so every 24hrs a read from database for logs

users (ID primary key, name, email, password)
Monitors (MonitorID primary key,ID forenkey of user's id col, monitor_name/website_name, URLS, time, status)
LOGS (ID foren key referencing monitor_Id, )
LOG_reports (ID forenkey to LOGS, incident report) ai creates incident report 

pls ignore the typos this is basic/rough thing 

Create table users;
insert into users values(ID primarykey, name varchar(20), email varchar(20), password varchar(20));

create table monitors;
insert into monitors values(monitor_id forenkey reference user.id, Id primarykey, monitor_name string, created_at datetime, urls string, time datetime)
<!-- monitor due to check data type boolean -->

create table status;
insert into status values()