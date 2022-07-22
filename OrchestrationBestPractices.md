# Orchestration best practices

This document is intended to provide best practices and tips for creating an orchestrator that can
run your Connector(s). There are several aspects or shortcuts you may take during development, but
as you look to deploy and support larger teams and co-existing with other Connectors, there are some
things to keep in mind.

## Briefcase management

Briefcases for an iModel are a limited (though still plentiful) resource. They can also be quite
large, and if not cared for, can leave parts of an iModel locked.

1. **Re-use briefcases when possible.** Aside from trivially re-using the ID of the briefcase to
   prevent over-provisioning, briefcases can be large, and may come from various data centers, so
   keeping your own copy can drastically reduce your effective startup time and reliability metrics.
   Briefcases are meant to be long-lived, and Connectors will automatically "pull, merge, push" when
   making changes, only downloading deltas from the last pull.
1. **Associate a briefcase ID with your job.** Even if you must purge and re-download the briefcase,
   it is important to re-use the ID so that you do not exhaust the maximum number of briefcases.
   N.B. that briefcases cannot be shared at runtime, so you must ensure only one Connector tries to
   use the briefcase at a time. A job (e.g. a set of input files + Connector assignment) is
   typically a good key for briefcase association since only one instance should run at a time.
1. **If all else fails, ensure you release the briefcase.** If you cannot retain the briefcase or
   its ID, you must release the briefcase at the end of the Connector job to free up the resource.

## Lock management

The Connector framework tries very hard to catch errors and relinquish locks in the case of errors,
but there are still categories of errors it cannot easily guard against (e.g. the node process
running out of memory). If a lock remains on the iModel, it could block all future runs of your
Connector, or possibly prevent any writes to the iModel (depending which lock was held).

Due to the severity of this condition, we recommend that orchestrators use a belt-and-suspenders
approach to relinquishing locks for a briefcase. While the Connector will handle locks most of the
time, the orchestrator (e.g. a parent process) can be an additional line of defense to ensure smooth
operation of the iModel.

## Concurrency
