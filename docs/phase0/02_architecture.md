# System Architecture

```
[Web UI] --REST--> [Backend API] --SQL--> [PostgreSQL]
                                  \--gRPC--> [Scheduler Service]
[Mobile] --REST--> [Backend API]
[AI Agent] <--> [Backend API]
```

Data flows are via HTTPS. Scheduler and AI Agent run as separate services.
