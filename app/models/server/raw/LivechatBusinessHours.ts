import { Collection, ObjectId } from 'mongodb';

import { BaseRaw } from './BaseRaw';
import {
	IBusinessHourWorkHour,
	ILivechatBusinessHour,
	LivechatBussinessHourTypes,
} from '../../../../definition/ILivechatBusinessHour';
import LivechatBusinessHoursModel from '../models/LivechatBusinessHours';

export interface IWorkHoursForCreateCronJobs {
	day: string;
	utc: string;
	start: string[];
	finish: string[];
}

export interface ILivechatBusinessHourRepository {
	insertOne(data: ILivechatBusinessHour): Promise<any>;
	findActiveAndOpenBusinessHoursByDay(day: string, options?: any): Promise<ILivechatBusinessHour[]>;
	findActiveBusinessHoursIdsToOpen(type: LivechatBussinessHourTypes, day: string, start: string, utc: string): Promise<string[]>;
	findActiveBusinessHoursIdsToClose(type: LivechatBussinessHourTypes, day: string, finish: string, utc: string): Promise<string[]>;
	findOneDefaultBusinessHour(): Promise<ILivechatBusinessHour>;
	findHoursToScheduleJobs(): Promise<IWorkHoursForCreateCronJobs[]>;
	updateOne(id: string, data: ILivechatBusinessHour): Promise<any>;
	updateDayOfGlobalBusinessHour(day: IBusinessHourWorkHour): Promise<any>;
}

class LivechatBusinessHoursRaw extends BaseRaw implements ILivechatBusinessHourRepository {
	public readonly col!: Collection<ILivechatBusinessHour>;

	findOneDefaultBusinessHour(): Promise<ILivechatBusinessHour> {
		return this.findOne({ type: LivechatBussinessHourTypes.SINGLE });
	}

	findActiveAndOpenBusinessHoursByDay(day: string, options?: any): Promise<ILivechatBusinessHour[]> {
		return this.find({
			active: true,
			workHours: {
				$elemMatch: {
					day,
					open: true,
				},
			},
		}, options).toArray();
	}

	async insertOne(data: Omit<ILivechatBusinessHour, '_id'>): Promise<any> {
		return this.col.insertOne({
			_id: new ObjectId().toHexString(),
			...data,
		});
	}

	async updateOne(_id: string, data: Omit<ILivechatBusinessHour, '_id'>): Promise<any> {
		const query = {
			_id,
		};

		const update = {
			$set: {
				...data,
			},
		};

		return this.col.updateOne(query, update);
	}

	// TODO: Remove this function after remove the deprecated method livechat:saveOfficeHours
	async updateDayOfGlobalBusinessHour(day: Omit<IBusinessHourWorkHour, 'code'>): Promise<any> {
		return this.col.updateOne({
			type: LivechatBussinessHourTypes.SINGLE,
			'workHours.day': day.day,
		}, {
			$set: {
				'workHours.$.start': day.start,
				'workHours.$.finish': day.finish,
				'workHours.$.open': day.open,
			},
		});
	}

	findHoursToScheduleJobs(): Promise<IWorkHoursForCreateCronJobs[]> {
		return this.col.aggregate([
			{
				$project: { _id: 0, workHours: 1, timezone: 1 },
			},
			{
				$unwind: { path: '$workHours' },
			},
			{ $match: { 'workHours.open': true } },
			{
				$group: {
					_id: { hour: '$workHours.day', utc: '$timezone.utc' },
					start: { $addToSet: '$workHours.start' },
					finish: { $addToSet: '$workHours.finish' },
				},
			},
			{
				$project: {
					_id: 0,
					day: '$_id.hour',
					utc: '$_id.utc',
					start: 1,
					finish: 1,
				},
			},
		]).toArray() as any;
	}

	async findActiveBusinessHoursIdsToOpen(type: LivechatBussinessHourTypes, day: string, start: string, utc: string): Promise<string[]> {
		return (await this.col.find({
			type,
			active: true,
			'timezone.utc': parseInt(utc),
			workHours: {
				$elemMatch: {
					day,
					start,
					open: true,
				},
			},
		},
		{
			fields: {
				_id: 1,
			},
		}).toArray()).map((businessHour) => businessHour._id);
	}

	async findActiveBusinessHoursIdsToClose(type: LivechatBussinessHourTypes, day: string, finish: string, utc: string): Promise<string[]> {
		return (await this.col.find({
			type,
			active: true,
			'timezone.utc': parseInt(utc),
			workHours: {
				$elemMatch: {
					day,
					finish,
					open: true,
				},
			},
		},
		{
			fields: {
				_id: 1,
			},
		}).toArray()).map((businessHour) => businessHour._id);
	}
}

export const LivechatBusinessHours: ILivechatBusinessHourRepository = new LivechatBusinessHoursRaw(LivechatBusinessHoursModel.model.rawCollection());